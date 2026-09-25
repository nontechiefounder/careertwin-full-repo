# Step 4B5.2-C.1.1 Execution Evidence

**Date:** August 3, 2026  
**Task:** Alembic migration SHA-256 hashes, provenance logs, RLS policy audit, quality gates, and package integrity for Step 4B5.2-C.1.1.

---

## 1. Migration Provenance & SHA-256 Hashes

- **Migration 1:** `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/migrations/versions/0001_initial_schema.py`
  - SHA-256: `d755ae9b4077be4b7c480df17496bd6345d8e94e7cb24fbfc42296210532a029`
  - Git Commit: `4d4a618578c8cba7ec7b532074f0f8ae36923f46` (Tue Jul 14 04:04:00 2026 +0530)
- **Migration 2:** `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/migrations/versions/0002_tenant_rls_and_audit.py`
  - SHA-256: `c8c7ecc487c42bfcd2fea53e885afbdf83d966a49665ba1004edb1a1e029fd72`
  - Git Commit: `4d4a618578c8cba7ec7b532074f0f8ae36923f46` (Tue Jul 14 04:04:00 2026 +0530)

---

## 2. Complete Migration Table & Constraint Inventory

```
Tables Defined in 0001_initial_schema.py:
1. organizations (id UUID PK, name, created_at)
2. users (id UUID PK, org_id FK, email, password_hash, role, active, created_at; UQ: org_id+email)
3. roles (id UUID PK, org_id FK, title, description, status, created_at)
4. requirements (id UUID PK, org_id FK, role_id FK, label, kind, weight, evidence_expectation, approved, version; CHK: weight 0..1)
5. candidates (id UUID PK, org_id FK, role_id FK, external_reference, created_at)
6. documents (id UUID PK, org_id FK, candidate_id FK, object_key, original_filename, media_type, sha256, scan_status, parser_version; UQ: org_id+sha256)
7. chunks (id UUID PK, org_id FK, document_id FK, page_number, ordinal, text, attributes, embedding Vector(1024); UQ: document_id+ordinal)
8. model_runs (id UUID PK, org_id FK, model_name, prompt_version, input_hash, output_hash, token_usage, latency_ms)
9. evidence_refs (id UUID PK, org_id FK, document_id FK, page_number, start_offset, end_offset, bounding_box, excerpt, excerpt_sha256, parser_version; CHK: offset order)
10. claims (id UUID PK, org_id FK, candidate_id FK, predicate, object_text, confidence, evidence_ids, model_run_id FK; CHK: confidence 0..1)
11. claim_edges (id UUID PK, org_id FK, source_claim_id FK, target_claim_id FK, relation, confidence; CHK: not self)
12. requirement_matches (id UUID PK, org_id FK, candidate_id FK, requirement_id FK, status, evidence_strength, evidence_ids, reason_codes, rationale, confidence, rubric_version; UQ: candidate_id+requirement_id)
13. trust_packets (id UUID PK, org_id FK, role_id FK, candidate_id FK, packet JSONB, version, released, released_by FK, released_at; UQ: candidate_id+version)
14. workflow_runs (id UUID PK, org_id FK, role_id FK, candidate_ids ARRAY, status, version, rubric_version, ontology_version)
15. workflow_steps (id UUID PK, org_id FK, run_id FK, stage, run_version, status, artifact_key, error JSONB; UQ: run_id+stage+version)
16. audit_events (id UUID PK, org_id FK, actor_id UUID, action, object_type, object_id UUID, before JSONB, after JSONB, trace_id, created_at)
17. outbox_events (id UUID PK, org_id FK, topic, aggregate_id UUID, payload JSONB, published_at, created_at)
```

---

## 3. Quality Gates Verification Output

- **Application ESLint Output:** `npm exec --offline eslint -- .`
  - Total Errors: **0**
  - Total Warnings: **3** (W07, W08, W09 — `@next/next/no-img-element` in `NaiveShell.jsx`, `MarketingFooter.jsx`, `MarketingNav.jsx`)
- **Full Vitest Test Suite Output:** `npm exec --offline vitest run`
  - Test Files: **15 passed (15)**
  - Total Tests: **158 passed (158)**
- **Next.js Production Build:** `node node_modules/next/dist/bin/next build`
  - Exit Code: **0**
  - Compiled Page Routes: **21 static/dynamic page routes**
  - Compiled API Route Files: **28 route files**
  - Compiled HTTP Method Handlers: **30 method handlers**

---

## 4. Source Integrity & Package Hashes

- [x] Production source code (`apps/web/**` excluding docs): **ZERO MODIFICATIONS**
- [x] Test code (`apps/web/__tests__/**`): **ZERO MODIFICATIONS**
- [x] Migration files (`migrations/**`): **ZERO MODIFICATIONS**
- [x] Database connections made: **ZERO CONNECTIONS**
- [x] Exposed credentials used: **ZERO CREDENTIALS USED**
- [x] New documentation created: Exactly 2 Markdown files under `docs/architecture/checkpoints/step4b5-2-c-1-1/`
- [x] `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Unchanged)
- [x] `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Unchanged)
- [x] Git remote: None
- [x] Push / Deployment: None
