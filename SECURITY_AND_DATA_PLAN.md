# Security & Data Governance Plan: Hiring Genome OS

**Security Objective:** Ensure complete tenant data isolation, zero leakage of protected demographic attributes, immutable auditability, candidate privacy compliance, and safe document ingestion.

---

## 1. Credential & Environment Variable Management

- **Zero Credentials in Repository:** Source code, configuration files, client bundles, and git commit history MUST contain zero secrets, API keys, passwords, or connection strings.
- **Environment Isolation:**
  - `NEXT_PUBLIC_*` variables restricted strictly to public URLs and anonymous frontend keys.
  - Sensitive keys (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `REDIS_URL`) stored exclusively in secure server-side environment vaults (Vercel Secret Manager, AWS Secrets Manager, or local `.env` files explicitly listed in `.gitignore`).
- **Provider API Privacy:** Google Gemini API calls configured with provider-side interaction logging disabled (`extra_body={"store": False}`) to guarantee candidate resumes are not used for public model training.

---

## 2. Multi-Tenant Isolation & Row-Level Security (RLS)

- **Logical Tenant Isolation:** Every request to `apps/api` must extract the tenant context (`org_id`) from the verified JWT bearer token in FastAPI middleware (`get_current_tenant`).
- **PostgreSQL Row Level Security (RLS):** Enable RLS on all database tables (`roles`, `requirements`, `candidates`, `documents`, `claims`, `trust_packets`, `audit_logs`).
  ```sql
  ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
  
  CREATE POLICY org_candidate_isolation ON candidates
      FOR ALL
      USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
  ```
- **Database Connection Pooling:** Ensure database connection pools clear session settings (`SET LOCAL app.current_org_id`) between transactions to prevent cross-tenant parameter leakage.

---

## 3. Protected Attribute Detection & Bias-Safe Guardrails

- **Sanitization Pipeline (IP Spec 076, 077, 078):** Prior to claim extraction or candidate evaluation, candidate documents pass through a text-sanitization pipeline that strips:
  - Demographic indicators (Age, Date of Birth, Gender, Pronouns, Race, Ethnicity, Nationality).
  - Proxy attributes (Graduation years beyond relative experience duration, profile photos, residential address details, sorority/fraternity names).
- **Invariance Testing:** Evaluated against `protected_attribute_leakage_tests.jsonl` from Golden Dataset v2. Assert 100% score invariance when demographic signals are systematically varied.

---

## 4. Candidate Consent & Data Permissioning

- **Explicit Consent Gates:** Candidates must explicitly grant consent via the Candidate Proof Portal before proof artifacts, code repositories, or work trials are parsed and evaluated.
- **Selective Disclosure Protocol (IP Spec 082, 083):** Candidates retain granular control over which proof artifacts are shared with specific employers.
- **Right-to-be-Forgotten & Data Deletion:** Support automated candidate deletion requests. Deleting a candidate record cascades across all child records (`documents`, `evidence_refs`, `claims`, `requirement_matches`, `trust_packets`) and purges physical object files in MinIO storage.

---

## 5. Immutable Audit Logging & Tamper-Evident Ledger

- **Append-Only Ledger (IP Spec 091, 095):** Store all system state changes in an append-only `audit_logs` table.
- **Cryptographic Hash Chaining:** Each audit entry calculates a SHA-256 hash over the payload and previous entry hash:
  $$\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} \mathbin{\Vert} \text{EventType} \mathbin{\Vert} \text{Payload} \mathbin{\Vert} \text{Timestamp})$$
- **Audited Events:** Genome compilations, Proof Contract releases, candidate evaluations, proof requests, proof submissions, and human decisions (**Advance**, **Hold**, **Reject**).

---

## 6. Human-in-the-Loop Release Gates

- **Strict Enforcement (IP Spec 028, 080, 100):** The system operates exclusively as a human decision support engine.
- **Prohibited Autonomous Actions:**
  - Automated candidate rejection emails.
  - Automated hiring offers or stage advancements.
  - Automated interview scheduling without employer review.
- **Mandatory Rationale:** All candidate status transitions require an authorized human employer user to provide written rationale logged in the audit ledger.

---

## 7. Secure Document Ingestion Pipeline

```
[Candidate File Upload] 
       │
       ▼
[MinIO Quarantine Bucket] ──► [ClamAV Virus Scanner Container]
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
                [Infection Detected]                [Clean File Passed]
                        │                                   │
                        ▼                                   ▼
             [Quarantine & Alert]           [Ingestion Worker & Sanitizer]
```

- **Quarantine Storage:** Uploaded candidate files (PDF, DOCX) land in a isolated MinIO quarantine bucket (`s3://quarantine-bucket/`).
- **Antivirus Scanning:** ClamAV container scans every file before processing. Infected files are immediately purged and flagged.
- **Sanitization & Limits:** Enforce maximum file size limits (10MB), validate MIME types, and sanitize PDF/DOCX structures to strip embedded macros or JavaScript payloads.

---

## 8. Disaster Recovery, Backup & High Availability

- **Automated Snapshots:** Daily encrypted snapshots of PostgreSQL databases stored in multi-region S3 storage.
- **Point-in-Time Recovery (PITR):** PostgreSQL Write-Ahead Logging (WAL) enabled to support recovery to any second within a 30-day window.
- **Health Monitoring:** FastAPI endpoints `/health/live` and `/health/ready` monitor database connectivity, Redis worker queues, and MinIO storage availability.
