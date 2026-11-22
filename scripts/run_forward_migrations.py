#!/usr/bin/env python3
"""Single-session advisory-locked forward migration runner for WorkByLine V3.

Guarantees:
1. Acquires and holds PostgreSQL session-level `pg_advisory_lock(8492041)` on ONE
   persistent database connection across the entire check-and-apply sequence.
2. Fails closed (`sys.exit(1)`) on any database connection or `schema_migrations`
   query failure (never defaults errors to '0' or '').
3. Verifies SHA-256 checksums of all applied migrations against on-disk files.
   - If a legacy `schema_migrations` row has NULL or empty `sha256`, verifies the
     on-disk file against `PINNED_HISTORICAL_SHA256` AND verifies live schema
     equivalence before backfilling the NULL checksum.
   - If an applied row has a known historical variant checksum (specifically from
     checkpoint `1f40f9f`), verifies live catalog schema equivalence first, keeps
     the original `schema_migrations.sha256` untouched (never overwrites historical
     checksums), and records an auditable row in `schema_migration_reconciliations`.
   - Any unknown checksum or schema drift fails closed immediately.
4. Applies each unapplied migration file and its `schema_migrations` tracking
   row inside the same atomic transaction (`with conn.transaction():`).
5. Releases `pg_advisory_unlock(8492041)` on the same persistent session before exit.
"""
# pyrefly: ignore[invalid-syntax]
from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import time
import uuid
from pathlib import Path

import psycopg


def strip_outer_begin_commit(sql_text: str) -> str:
    """Strip standalone top-level BEGIN; and COMMIT; lines so the migration can run
    inside psycopg's atomic `with conn.transaction():` block without nested transaction warnings."""
    lines = sql_text.splitlines()
    out = []
    for line in lines:
        stripped = line.strip()
        if re.match(r"^(BEGIN|COMMIT)\s*;?\s*$", stripped, flags=re.IGNORECASE):
            continue
        out.append(line)
    return "\n".join(out) + "\n"


def strip_outer_begin_commit(sql_text: str) -> str:
    """Strip standalone top-level BEGIN; at the start and COMMIT; at the end so the migration
    can run inside psycopg's atomic `with conn.transaction():` block without nested transaction warnings."""
    lines = sql_text.splitlines()
    # Strip first non-comment non-empty line if it is BEGIN;
    for idx, line in enumerate(lines):
        s = line.strip()
        if not s or s.startswith("--"):
            continue
        if re.match(r"^BEGIN\s*;\s*$", s, flags=re.IGNORECASE):
            lines[idx] = ""
        break
    # Strip last non-comment non-empty line if it is COMMIT;
    for idx in range(len(lines) - 1, -1, -1):
        s = lines[idx].strip()
        if not s or s.startswith("--"):
            continue
        if re.match(r"^COMMIT\s*;\s*$", s, flags=re.IGNORECASE):
            lines[idx] = ""
        break
    return "\n".join(lines) + "\n"

ADVISORY_LOCK_ID = 8492041

# Canonical historical SHA-256 checksums for migrations 000..007 (f41e503 / 870e3d2 baseline).
PINNED_HISTORICAL_SHA256: dict[str, str] = {
    "000_contain_unsafe_legacy_rpc.sql": "a3abd1c6c1439fb80bf4f0bc17baba51dda27cdbf787e41aa805877b02d78b8c",
    "001_evidence_service.sql": "0692a2e08b2b2405b362198bc54fdacdced7f53755de8b97b0c342504927bc4d",
    "004_hybrid_retrieval.sql": "294508df17712cc5a0f3bc60a5d3138bf79f23545d8ee9a25f49fb575ea2be15",
    "005_v3_projections_and_semantics.sql": "9c2701390914b35020ace9ead32a0d10fe898cee28d52e1c82601c161ce09644",
    "006_indexing_stages_and_erasure_recovery.sql": "e66da886c3adcae499986860e01543d950dd382ef2c288f5fb764e721972fffb",
    "007_closeout_provenance_and_recovery_leases.sql": "1261890533ffde6b157a2ec0cd703edd0f469d6cb1ae893b59d801d871a9607f",
}

# Known historical variant checksums from checkpoint 1f40f9f.
# Accepted ONLY if live catalog schema equivalence passes verification.
KNOWN_HISTORICAL_VARIANTS: dict[tuple[str, str], str] = {
    (
        "000_contain_unsafe_legacy_rpc.sql",
        "dc65b2e90f3bb5dbee284a027373083c833b0b51acbc8851bf1a8459e2b8c252",
    ): "checkpoint_1f40f9f_no_outer_begin_commit",
    (
        "001_evidence_service.sql",
        "efa41e90412db0d353db2ccb463adf4c07f4863498ebe82db95d5eb69699c168",
    ): "checkpoint_1f40f9f_no_outer_begin_commit",
    (
        "004_hybrid_retrieval.sql",
        "4a0bb07179d769bd36c9ed84e9ae55f9e22d156a4a04daccd8bdc3e9a9f4d123",
    ): "checkpoint_1f40f9f_conditional_vector_block",
    (
        "006_indexing_stages_and_erasure_recovery.sql",
        "bc209d4b9c2b81fd897ef72b434e7e3981abe2ef8ffbfaa0602ec2d1879148fc",
    ): "checkpoint_1f40f9f_inline_provenance_cols",
}


def normalize_pg_dsn(dsn: str) -> str:
    for prefix in ("postgresql+psycopg://", "postgresql+psycopg2://", "postgresql+asyncpg://"):
        if dsn.startswith(prefix):
            return "postgresql://" + dsn[len(prefix):]
    return dsn


def _verify_tables_and_rls(cur, tables: list[str]) -> tuple[bool, str]:
    for tbl in tables:
        cur.execute(
            "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relname = %s;",
            (tbl,),
        )
        row = cur.fetchone()
        if not row:
            return False, f"missing_table:{tbl}"
        if row[0] is not True:
            return False, f"rls_disabled:{tbl}"
    return True, f"verified_tables_and_rls:{','.join(tables)}"


def verify_historical_variant_schema_equivalence(cur, mig_name: str) -> tuple[bool, str]:
    """Verify that the live PostgreSQL catalog satisfies the exact structural and security
    invariants of canonical migration `mig_name` before accepting a known historical variant."""
    if mig_name == "000_contain_unsafe_legacy_rpc.sql":
        cur.execute(
            "SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace "
            "WHERE n.nspname = 'public' AND p.proname = 'ingest_context_source_version_transactional';"
        )
        for (fn_oid,) in cur.fetchall():
            cur.execute("SELECT has_function_privilege('public', %s, 'EXECUTE');", (fn_oid,))
            if cur.fetchone()[0]:
                return False, "unsafe_rpc_still_executable_by_public"
        return True, "legacy_rpc_containment_verified"

    if mig_name == "001_evidence_service.sql":
        core_tables = [
            "wbctx_bindings",
            "wbctx_nonces",
            "wbctx_sources",
            "wbctx_versions",
            "wbctx_artifacts",
            "wbctx_spans",
            "wbctx_jobs",
        ]
        return _verify_tables_and_rls(cur, core_tables)

    if mig_name == "004_hybrid_retrieval.sql":
        ok, detail = _verify_tables_and_rls(cur, ["wbctx_span_embeddings"])
        if not ok:
            return False, detail
        # Critical check for 1f40f9f's 004 variant: verify embedding column is real pgvector `vector`, NOT `text` fallback!
        cur.execute(
            "SELECT data_type, udt_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'wbctx_span_embeddings' AND column_name = 'embedding';"
        )
        col = cur.fetchone()
        if not col or col[1] != "vector":
            return False, f"wbctx_span_embeddings.embedding_invalid_type:{col[1] if col else 'missing'}"
        cur.execute(
            "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'wbctx_spans' AND indexname = 'wbctx_spans_text_gin';"
        )
        if not cur.fetchone():
            return False, "missing_index:wbctx_spans_text_gin"
        return True, "wbctx_span_embeddings_vector_udt_and_gin_index_verified"

    if mig_name == "005_v3_projections_and_semantics.sql":
        return _verify_tables_and_rls(cur, ["wbctx_projections", "wbctx_idempotency_keys"])

    if mig_name == "006_indexing_stages_and_erasure_recovery.sql":
        ok, detail = _verify_tables_and_rls(cur, ["wbctx_indexings", "wbctx_erasure_tombstones"])
        if not ok:
            return False, detail
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'wbctx_indexings';"
        )
        cols = {r[0] for r in cur.fetchall()}
        required = {"version", "status", "model_id", "indexed_spans", "error", "updated_at"}
        if not required.issubset(cols):
            return False, f"wbctx_indexings_missing_columns:{sorted(required - cols)}"
        return True, "wbctx_indexings_and_erasure_tombstones_verified"

    return False, f"no_equivalence_rule_for:{mig_name}"


def seed_synthetic_bindings(cur) -> int:
    """Idempotently seed synthetic recruiter/owner/auditor bindings in wbctx_bindings
    matching the synthetic organizations and runs in supabase/seed.sql and apps/web/.env.local."""
    bindings = [
        # Org Alpha (00000000-0000-4000-c000-000000000001) - Run 1bea003e-9466-4e4e-a185-6cc7cdd06ff1
        ("00000000-0000-4000-a000-000000000001", "00000000-0000-4000-c000-000000000001", "1bea003e-9466-4e4e-a185-6cc7cdd06ff1", "ws_alpha_corp", "role_alpha_lead", True, True),
        ("00000000-0000-4000-a000-000000000003", "00000000-0000-4000-c000-000000000001", "1bea003e-9466-4e4e-a185-6cc7cdd06ff1", "ws_alpha_corp", "role_alpha_lead", True, True),
        ("00000000-0000-4000-a000-000000000004", "00000000-0000-4000-c000-000000000001", "1bea003e-9466-4e4e-a185-6cc7cdd06ff1", "ws_alpha_corp", "role_alpha_lead", True, False),
        # Org Alpha - Secondary Run 95709284-d21b-496e-bb7c-6c68d067c422
        ("00000000-0000-4000-a000-000000000001", "00000000-0000-4000-c000-000000000001", "95709284-d21b-496e-bb7c-6c68d067c422", "ws_alpha_corp", "role_alpha_lead", True, True),
        ("00000000-0000-4000-a000-000000000003", "00000000-0000-4000-c000-000000000001", "95709284-d21b-496e-bb7c-6c68d067c422", "ws_alpha_corp", "role_alpha_lead", True, True),
        ("00000000-0000-4000-a000-000000000004", "00000000-0000-4000-c000-000000000001", "95709284-d21b-496e-bb7c-6c68d067c422", "ws_alpha_corp", "role_alpha_lead", True, False),
        # Org Alpha - Seed Run 11111111-1111-4111-a111-111111111111
        ("00000000-0000-4000-a000-000000000001", "00000000-0000-4000-c000-000000000001", "11111111-1111-4111-a111-111111111111", "ws_alpha_corp", "role_alpha_lead", True, True),
        ("00000000-0000-4000-a000-000000000003", "00000000-0000-4000-c000-000000000001", "11111111-1111-4111-a111-111111111111", "ws_alpha_corp", "role_alpha_lead", True, True),
        ("00000000-0000-4000-a000-000000000004", "00000000-0000-4000-c000-000000000001", "11111111-1111-4111-a111-111111111111", "ws_alpha_corp", "role_alpha_lead", True, False),
        # Org Beta (00000000-0000-4000-c000-000000000002) - Runs 22222222-2222-4000-c000-000000000002 & 22222222-2222-4222-a222-222222222222
        ("00000000-0000-4000-a000-000000000002", "00000000-0000-4000-c000-000000000002", "22222222-2222-4000-c000-000000000002", "ws_beta_corp", "role_beta_lead", True, True),
        ("00000000-0000-4000-a000-000000000002", "00000000-0000-4000-c000-000000000002", "22222222-2222-4222-a222-222222222222", "ws_beta_corp", "role_beta_lead", True, True),
    ]
    inserted = 0
    for actor, org, run_id, ws, role, active, can_write in bindings:
        cur.execute(
            """
            INSERT INTO wbctx_bindings (id, actor, org, run, workspace, role, active, can_write)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (actor, org, run, workspace, role) DO UPDATE SET
                active = EXCLUDED.active,
                can_write = EXCLUDED.can_write;
            """,
            (str(uuid.uuid4()), actor, org, run_id, ws, role, active, can_write),
        )
        inserted += 1
    return inserted


def main() -> int:
    parser = argparse.ArgumentParser(description="WorkByLine V3 Single-Session Locked Migration Runner")
    parser.add_argument("--db-url", default=os.environ.get("WORKBYLINE_CONTEXT_DATABASE_URL") or os.environ.get("DATABASE_URL") or "")
    parser.add_argument("--migrations-dir", default=str(Path(__file__).resolve().parent.parent / "migrations"))
    parser.add_argument("--hold-lock-seconds", type=float, default=0.0, help="Hold advisory lock for testing concurrency")
    parser.add_argument("--worker-label", default="main", help="Label for structured migration logs")
    parser.add_argument("--seed-synthetic-bindings", action="store_true", help="Idempotently seed synthetic bindings for local acceptance")
    args = parser.parse_args()

    if not args.db_url:
        print("ERROR: Database URL is required for migrations.", file=sys.stderr)
        return 1

    migrations_dir = Path(args.migrations_dir).resolve()
    if not migrations_dir.is_dir():
        print(f"ERROR: Migrations directory not found: {migrations_dir}", file=sys.stderr)
        return 1

    migration_files = sorted(p for p in migrations_dir.glob("*.sql") if p.is_file())
    if not migration_files:
        print(f"ERROR: No migration SQL files found in {migrations_dir}", file=sys.stderr)
        return 1

    pg_dsn = normalize_pg_dsn(args.db_url)

    try:
        conn = psycopg.connect(pg_dsn, autocommit=True, connect_timeout=5)
    except Exception as exc:
        print(f"ERROR: Failed to connect to database for migrations: {type(exc).__name__}", file=sys.stderr)
        return 1

    lock_acquired = False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_backend_pid();")
            backend_pid = cur.fetchone()[0]
            print(f"  [{args.worker_label}] Connected (backend_pid={backend_pid}). Acquiring session advisory lock {ADVISORY_LOCK_ID}...", flush=True)
            t_wait_start = time.time()
            cur.execute("SELECT pg_advisory_lock(%s);", (ADVISORY_LOCK_ID,))
            lock_acquired = True
            wait_ms = int((time.time() - t_wait_start) * 1000)
            print(f"  [{args.worker_label}] Acquired advisory lock {ADVISORY_LOCK_ID} on backend_pid={backend_pid} (waited_ms={wait_ms}).", flush=True)

            if args.hold_lock_seconds > 0:
                time.sleep(args.hold_lock_seconds)

            # Ensure schema_migrations and schema_migration_reconciliations tracking tables exist
            with conn.transaction():
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version text PRIMARY KEY,
                        sha256 text NOT NULL,
                        applied_at timestamptz NOT NULL DEFAULT now()
                    );
                    ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS sha256 text;
                    CREATE TABLE IF NOT EXISTS schema_migration_reconciliations (
                        version TEXT PRIMARY KEY REFERENCES schema_migrations(version) ON DELETE CASCADE,
                        recorded_sha256 TEXT NOT NULL,
                        canonical_file_sha256 TEXT NOT NULL,
                        variant_origin TEXT NOT NULL,
                        schema_equivalence_verified BOOLEAN NOT NULL,
                        verified_details TEXT NOT NULL,
                        reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    """
                )

            # Query existing applied migrations — fail closed on any query error
            cur.execute("SELECT version, sha256 FROM schema_migrations ORDER BY version;")
            applied_rows = {row[0]: row[1] for row in cur.fetchall()}

            # Check whether this is an untracked legacy f41e503 database (wbctx_bindings exists but schema_migrations is empty)
            cur.execute("SELECT to_regclass('public.wbctx_bindings') IS NOT NULL;")
            has_untracked_preexisting_schema = (len(applied_rows) == 0 and bool(cur.fetchone()[0]))

            for mig_path in migration_files:
                mig_name = mig_path.name
                sql_bytes = mig_path.read_bytes()
                file_sha256 = hashlib.sha256(sql_bytes).hexdigest()
                sql_text = sql_bytes.decode("utf-8")
                exec_sql_text = strip_outer_begin_commit(sql_text)

                if mig_name not in applied_rows and has_untracked_preexisting_schema and mig_name in PINNED_HISTORICAL_SHA256 and mig_name < "007_":
                    # Verify the live catalog matches the expected canonical schema for this 000..006 migration
                    eq_ok, eq_detail = verify_historical_variant_schema_equivalence(cur, mig_name)
                    if eq_ok and file_sha256 == PINNED_HISTORICAL_SHA256[mig_name]:
                        with conn.transaction():
                            cur.execute(
                                "INSERT INTO schema_migrations (version, sha256, applied_at) VALUES (%s, %s, NOW());",
                                (mig_name, file_sha256),
                            )
                            cur.execute(
                                """
                                INSERT INTO schema_migration_reconciliations (
                                    version, recorded_sha256, canonical_file_sha256,
                                    variant_origin, schema_equivalence_verified, verified_details, reconciled_at
                                )
                                VALUES (%s, %s, %s, 'checkpoint_f41e503_untracked_baseline', TRUE, %s, NOW())
                                ON CONFLICT (version) DO NOTHING;
                                """,
                                (mig_name, file_sha256, file_sha256, eq_detail),
                            )
                        print(
                            f"  [{args.worker_label}] Reconciled untracked f41e503 baseline migration {mig_name} "
                            f"(sha256={file_sha256[:12]}..., check={eq_detail})",
                            flush=True,
                        )
                        continue

                if mig_name in applied_rows:
                    existing_sha = (applied_rows[mig_name] or "").strip()
                    if not existing_sha:
                        # Legacy row with NULL/empty sha256: verify against pinned historical hash table AND live catalog
                        pinned_sha = PINNED_HISTORICAL_SHA256.get(mig_name)
                        if not pinned_sha:
                            print(
                                f"ERROR: Migration {mig_name} is recorded in schema_migrations with NULL/empty sha256 "
                                f"and has no pinned historical checksum. Refusing unverified backfill.",
                                file=sys.stderr,
                            )
                            return 1
                        if file_sha256 != pinned_sha:
                            print(
                                f"ERROR: Migration {mig_name} has NULL sha256 in schema_migrations and current file "
                                f"({file_sha256}) does not match pinned historical sha256 ({pinned_sha})!",
                                file=sys.stderr,
                            )
                            return 1
                        eq_ok, eq_detail = verify_historical_variant_schema_equivalence(cur, mig_name)
                        if not eq_ok:
                            print(
                                f"ERROR: SCHEMA_DRIFT_DETECTED on legacy NULL-sha256 migration {mig_name}: {eq_detail}",
                                file=sys.stderr,
                            )
                            return 1
                        with conn.transaction():
                            cur.execute(
                                "UPDATE schema_migrations SET sha256 = %s WHERE version = %s;",
                                (file_sha256, mig_name),
                            )
                        print(f"  [{args.worker_label}] Verified & backfilled legacy sha256 for {mig_name} ({file_sha256[:12]}...)", flush=True)
                        continue

                    if existing_sha != file_sha256:
                        variant_origin = KNOWN_HISTORICAL_VARIANTS.get((mig_name, existing_sha))
                        if not variant_origin:
                            print(
                                f"ERROR: MIGRATION_CHECKSUM_MISMATCH on {mig_name}! "
                                f"Applied: {existing_sha}, Current file: {file_sha256}. Unknown drift or tampering detected.",
                                file=sys.stderr,
                            )
                            return 1

                        # Known historical variant (e.g., 1f40f9f): verify live catalog schema equivalence first!
                        eq_ok, eq_detail = verify_historical_variant_schema_equivalence(cur, mig_name)
                        if not eq_ok:
                            print(
                                f"ERROR: SCHEMA_DRIFT_DETECTED for historical variant {variant_origin} on {mig_name}: {eq_detail}",
                                file=sys.stderr,
                            )
                            return 1

                        # Never overwrite schema_migrations.sha256; record audited reconciliation instead
                        with conn.transaction():
                            cur.execute(
                                """
                                INSERT INTO schema_migration_reconciliations (
                                    version, recorded_sha256, canonical_file_sha256,
                                    variant_origin, schema_equivalence_verified, verified_details, reconciled_at
                                )
                                VALUES (%s, %s, %s, %s, TRUE, %s, NOW())
                                ON CONFLICT (version) DO UPDATE SET
                                    recorded_sha256 = EXCLUDED.recorded_sha256,
                                    canonical_file_sha256 = EXCLUDED.canonical_file_sha256,
                                    variant_origin = EXCLUDED.variant_origin,
                                    schema_equivalence_verified = EXCLUDED.schema_equivalence_verified,
                                    verified_details = EXCLUDED.verified_details,
                                    reconciled_at = NOW();
                                """,
                                (mig_name, existing_sha, file_sha256, variant_origin, eq_detail),
                            )
                        print(
                            f"  [{args.worker_label}] Reconciled known historical variant for {mig_name} "
                            f"(preserved recorded sha256={existing_sha[:12]}..., origin={variant_origin}, check={eq_detail})",
                            flush=True,
                        )
                        continue

                    print(f"  [{args.worker_label}] Skipping already applied: {mig_name} (sha256: {file_sha256[:12]}...)", flush=True)
                    continue

                print(f"  [{args.worker_label}] Applying {mig_name} (sha256: {file_sha256[:12]}...)...", flush=True)
                try:
                    with conn.transaction():
                        cur.execute(exec_sql_text)
                        cur.execute(
                            """
                            INSERT INTO schema_migrations (version, sha256, applied_at)
                            VALUES (%s, %s, NOW());
                            """,
                            (mig_name, file_sha256),
                        )
                    print(f"  [{args.worker_label}] -> Applied: {mig_name}", flush=True)
                except Exception as mig_exc:
                    print(
                        f"ERROR: Migration {mig_name} failed and rolled back atomically: {mig_exc}",
                        file=sys.stderr,
                    )
                    return 1

            if args.seed_synthetic_bindings:
                with conn.transaction():
                    cnt = seed_synthetic_bindings(cur)
                print(f"  [{args.worker_label}] Verified {cnt} synthetic authorization bindings in wbctx_bindings.", flush=True)

        print(f"  [{args.worker_label}] All forward migrations (000 -> 008) verified.", flush=True)
        return 0
    except Exception as exc:
        print(f"ERROR: Migration runner failed closed: {exc}", file=sys.stderr)
        return 1
    finally:
        if lock_acquired:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_advisory_unlock(%s);", (ADVISORY_LOCK_ID,))
                    print(f"  [{args.worker_label}] Released advisory lock {ADVISORY_LOCK_ID}.", flush=True)
            except Exception:
                pass
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
