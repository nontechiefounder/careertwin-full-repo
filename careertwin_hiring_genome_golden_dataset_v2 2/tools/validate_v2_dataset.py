#!/usr/bin/env python3
import csv, hashlib, json, math, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS = []
V2_REQUIRED = {"schema_version","record_id","synthetic","source_refs","created_at","difficulty"}
BAD_PARTS = {".DS_Store","__MACOSX","__pycache__"}
BAD_SUFFIX = {".pyc",".tmp",".swp"}

def fail(msg): ERRORS.append(msg)
def lines(path):
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(),1):
        if line.strip():
            try: yield n, json.loads(line)
            except Exception as e: fail(f"{path.relative_to(ROOT)}:{n}: invalid JSON: {e}")

files=[p for p in ROOT.rglob("*") if p.is_file()]
for p in files:
    rel=p.relative_to(ROOT)
    if any(x in BAD_PARTS for x in rel.parts) or p.suffix in BAD_SUFFIX:
        fail(f"forbidden packaging file: {rel}")

record_ids=set()
for p in files:
    if p.suffix==".jsonl":
        for n,row in lines(p):
            if p.name in {"golden_roles.jsonl","golden_candidates.jsonl","expected_claims.jsonl","expected_proof_contracts.jsonl","expected_decision_blockers.jsonl","protected_attribute_leakage_tests.jsonl","v1_to_v2_corrections.jsonl"}:
                continue
            missing=V2_REQUIRED-set(row)
            if missing: fail(f"{p.name}:{n}: missing core fields {sorted(missing)}")
            if row.get("schema_version")!="2.0.0" or row.get("synthetic") is not True or row.get("created_at")!="2026-07-26T00:00:00Z":
                fail(f"{p.name}:{n}: invalid core constants")
            rid=row.get("record_id")
            if rid in record_ids: fail(f"duplicate record_id: {rid}")
            record_ids.add(rid)
            for key,val in row.items():
                if key=="distribution" or key.endswith("_distribution"):
                    if isinstance(val,dict) and abs(sum(val.values())-1.0)>1e-6:
                        fail(f"{rid}: distribution does not sum to 1")
                if key in {"before_distribution","updated_distribution"} and abs(sum(val.values())-1.0)>1e-6:
                    fail(f"{rid}: {key} does not sum to 1")

for p in files:
    if p.suffix==".json":
        try: json.loads(p.read_text(encoding="utf-8"))
        except Exception as e: fail(f"{p.relative_to(ROOT)} invalid JSON: {e}")
    if p.suffix==".csv":
        try:
            with p.open(encoding="utf-8",newline="") as f: list(csv.DictReader(f))
        except Exception as e: fail(f"{p.relative_to(ROOT)} invalid CSV: {e}")

companies={x["company_id"] for _,x in lines(ROOT/"golden_companies.jsonl")}
roles={x["role_id"] for _,x in lines(ROOT/"golden_roles.jsonl")}
cands={x["candidate_id"] for _,x in lines(ROOT/"golden_candidates.jsonl")}
if len(companies)!=8: fail(f"expected 8 companies, got {len(companies)}")
if len(roles)!=20: fail(f"expected 20 roles, got {len(roles)}")
if len(cands)!=60: fail(f"expected 60 candidates, got {len(cands)}")

expected_counts={
"golden_historical_decisions.jsonl":192,
"expected_ats_normalization.jsonl":240,
"expected_post_proof_updates.jsonl":24,
"expected_code_claims.jsonl":12,
"expected_interview_signal_extraction.jsonl":24,
"golden_outcomes.jsonl":96,
"expected_memory_updates.jsonl":32,
"expected_safety_invariance_tests.jsonl":40,
"expected_evidence_subset_validation.jsonl":30,
"expected_human_review_flags.jsonl":30,
"expected_work_trial_evaluations.jsonl":30,
"golden_fraud_cases.jsonl":30,
"expected_candidate_proof_passports.jsonl":60,
"golden_policy_cases.jsonl":30,
"golden_panel_feedback.jsonl":24,
"golden_sourcing_pool.jsonl":300,
"golden_outreach_messages.jsonl":80,
"expected_meeting_booking_states.jsonl":40,
"expected_language_handling.jsonl":40,
}
for name,want in expected_counts.items():
    got=sum(1 for _ in lines(ROOT/name))
    if got!=want: fail(f"{name}: expected {want}, got {got}")

for _,row in lines(ROOT/"expected_safety_invariance_tests.jsonl"):
    a,b=row["variants"]
    if a["expected_output"]!=b["expected_output"]:
        fail(f"{row['record_id']}: safety outputs differ")
    if row["include_in_normal_retrieval"] or row["memory_compilation_allowed"]:
        fail(f"{row['record_id']}: unsafe safety-fixture routing")

for _,row in lines(ROOT/"expected_post_proof_updates.jsonl"):
    if row["prior_evaluation_revision"]==row["updated_evaluation_revision"]:
        fail(f"{row['record_id']}: revision chain did not advance")
    if not (ROOT/row["submitted_artifact"]).exists():
        fail(f"{row['record_id']}: missing proof artifact")

proof_rows=[row for _,row in lines(ROOT/"expected_post_proof_updates.jsonl")]
if sum(1 for row in proof_rows if row["proof_outcome"]=="resolved" and row["updated_readiness_state"]=="interview_ready") < 8:
    fail("expected at least 8 fully resolved proof loops advancing to interview_ready")

for _,row in lines(ROOT/"expected_code_claims.jsonl"):
    if not (ROOT/row["artifact_path"]).is_dir():
        fail(f"{row['record_id']}: missing code artifact")
    for claim in row["claims"]:
        if claim["evidence_status"]=="verified":
            if not claim["source"] or not (ROOT/claim["source"]).exists():
                fail(f"{row['record_id']}: verified code claim lacks source")

for p in [ROOT/"expected_proof_contracts.jsonl"]:
    for _,row in lines(p):
        weights=[d["importance_weight"] for d in row["proof_contract"]]
        if abs(sum(weights)-1)>1e-6: fail(f"{row['role_id']}: contract weights do not sum to 1")

manifest=json.loads((ROOT/"manifest.json").read_text())
actual={p.relative_to(ROOT).as_posix():p for p in files if p.name!="manifest.json" and "__pycache__" not in p.parts}
listed={x["path"]:x for x in manifest["files"]}
if set(actual)!=set(listed): fail("manifest file set mismatch")
for rel,p in actual.items():
    h=hashlib.sha256(p.read_bytes()).hexdigest()
    if listed[rel]["sha256"]!=h or listed[rel]["bytes"]!=p.stat().st_size:
        fail(f"manifest mismatch: {rel}")

if ERRORS:
    print("FAIL")
    for e in ERRORS: print("-",e)
    sys.exit(1)
print(f"PASS: {len(files)} files; {len(record_ids)} unique v2 records; all structural, count, provenance, distribution, safety, and manifest checks passed.")
