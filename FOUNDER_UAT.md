# WorkByLine V2 — Founder User Acceptance Testing (UAT) Guide

**Version:** WorkByLine V2 Review Candidate  
**Target URL:** `http://127.0.0.1:3004`  
**API Health Check:** `http://127.0.0.1:3004/api/health`  
**Status:** **Founder Testing Available for Selected Capabilities** (Local acceptance verified; hosted engine acceptance requires external prerequisites).

---

## 1. Verified Synthetic Test Credentials

All accounts use the standard test password: `TestPassword123!`

| Role | Email | Company / Tenant | Permissions |
| :--- | :--- | :--- | :--- |
| **Employer Owner (Tenant Alpha)** | `synthetic.employer.alpha@example.invalid` | Organization Alpha Corp | Full Read/Write (Briefs, Documents, Search) |
| **Auditor (Tenant Alpha)** | `synthetic.employer.alpha.auditor@example.invalid` | Organization Alpha Corp | Read-Only (Uploads rejected with `ACCESS_DENIED`) |
| **Employer Owner (Tenant Beta)** | `synthetic.employer.beta@example.invalid` | Organization Beta Corp | Isolated Tenant (Cannot access Tenant Alpha resources) |

---

## 2. Service Startup Instructions

To start the local runtime from a clean terminal:

### Step 1: Ensure Disposable Database is Running
```bash
# Verify container is healthy on port 54399
docker ps --filter "name=wbctx-disposable-eval-pg"
```

### Step 2: Start Python Memory API Service (Port 8011)
```bash
cd /Users/darshilparmar/Desktop/Genome/careertwin-v2-memory-expansion-worktree
source .venv/bin/activate
WORKBYLINE_CONTEXT_DATABASE_URL="postgresql+psycopg://postgres:postgres@127.0.0.1:54399/postgres" \
WORKBYLINE_CONTEXT_STORAGE="/tmp/wbctx_live_storage" \
WORKBYLINE_CONTEXT_DELEGATION_SECRET="acceptance-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
python -m service.run_memory serve --host 127.0.0.1 --port 8011
```

### Step 3: Start Production Next.js Web Application (Port 3004)
```bash
cd /Users/darshilparmar/Desktop/Genome/careertwin-v2-memory-expansion-worktree/apps/web
PORT=3004 npm run start -- -p 3004
```

---

## 3. Step-by-Step Founder Acceptance Walkthrough

### Test Case 1: Sign-in & Brief Navigation
1. Open your browser and navigate to `http://127.0.0.1:3004/auth`.
2. Sign in using `synthetic.employer.alpha@example.invalid` and `TestPassword123!`.
3. You will be redirected to the employer overview.
4. Navigate to either of the verified mapped briefs:
   - `http://127.0.0.1:3004/employer/brief/1bea003e-9466-4e4e-a185-6cc7cdd06ff1` (Database Architect)
   - `http://127.0.0.1:3004/employer/brief/95709284-d21b-496e-bb7c-6c68d067c422` (Database Architect)
5. **Expected Outcome:** The brief renders with the Context & Evidence Repository panel (ready for uploads without `UNMAPPED_WORKSPACE` error).

### Test Case 2: Document Upload & Span Inspection
1. In the Context & Evidence Repository panel, choose a file (`.txt`, `.pdf`, or `.docx`).
2. Provide a unique source key (e.g. `eng_lead_01`).
3. Click **Upload Document**.
4. Run the background Temporal worker script to index the file:
   ```bash
   NODE_PATH=apps/web/node_modules node -e "
     const { execSync } = require('child_process');
     console.log(execSync('./.venv/bin/python -c \"import asyncio; from temporalio.testing import WorkflowEnvironment; from temporalio.worker import Worker; from concurrent.futures import ThreadPoolExecutor; from service.temporal_pipeline import EvidenceVersionWorkflow, EvidenceActivities, dispatch_pending; from service.cli import configured; async def run(): k = configured(); async with await WorkflowEnvironment.start_time_skipping() as env: a = EvidenceActivities(k); await dispatch_pending(k, env.client, \\'wbctx-evidence\\'); asyncio.run(run())\"', { encoding: 'utf-8' }));
   "
   ```
5. Click **Refresh Sources** in the UI.
6. Click on the uploaded document to open the Source Inspector.
7. **Expected Outcome:** Inspector displays the original file SHA-256 hash, Unicode code-point character offsets, and extracted text spans.

### Test Case 3: Source-Grounded Evidence Search
1. In the search box, enter keywords from your document (e.g., "distributed consensus").
2. Ensure the strategy selector is set to **Search (Lexical / Hybrid)**.
3. Click **Search Evidence**.
4. **Expected Outcome:** Matching text passages from your document render in the UI with citation provenance.

### Test Case 4: Document Version Revision (v2 Superseding v1)
1. Select the same source key used in Test Case 2 (`eng_lead_01`).
2. Upload a modified version of the document.
3. Trigger the worker indexing step.
4. Click **Refresh Sources**.
5. **Expected Outcome:** Document badge updates to `v2`. Search queries retrieve updated `v2` content while preserving immutable `v1` audit records.

### Test Case 5: Cross-Tenant Resource Isolation
1. Open an incognito browser window and navigate to `http://127.0.0.1:3004/auth`.
2. Sign in as Tenant Beta: `synthetic.employer.beta@example.invalid` / `TestPassword123!`.
3. Attempt to directly access Tenant Alpha's brief URL: `http://127.0.0.1:3004/employer/brief/1bea003e-9466-4e4e-a185-6cc7cdd06ff1`.
4. **Expected Outcome:** Access is blocked with an access denied / forbidden message.

### Test Case 6: Auditor Read-Only Enforcement
1. In another session, sign in as the Auditor: `synthetic.employer.alpha.auditor@example.invalid` / `TestPassword123!`.
2. Navigate to Tenant Alpha's brief: `http://127.0.0.1:3004/employer/brief/1bea003e-9466-4e4e-a185-6cc7cdd06ff1`.
3. Try to upload a document.
4. **Expected Outcome:** Upload fails immediately with an explicit `ACCESS_DENIED` security error banner.

---

## 4. Current Limitations & Blocked Live Gates
- **Live Gemini Generation:** Fails closed with HTTP 503 (`BLOCKED_PENDING_KEY_ROTATION`) until `GEMINI_API_KEY` is provided.
- **Live Graphiti Graph Visualizer:** Returns truthful notice that local Neo4j backend is not connected.
- **Embedded vs Persistent Temporal:** Workflows process through the embedded Python SDK test server rather than a standalone Temporal cluster daemon on port 7233.
