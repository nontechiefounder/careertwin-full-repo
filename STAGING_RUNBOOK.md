# WorkByLine V3 — Staging Deployment & Operations Runbook

**Target Audience:** Parth & Engineering Operations  
**Document Version:** 3.0  
**Release Candidate:** WorkByLine V3  
**Target Environment:** Staging / Pre-Production  

---

## 1. Pre-Deployment Prerequisites

Ensure the target host satisfies the following environment prerequisites prior to deployment:

1. **Host Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 / RHEL 9) or macOS (Darwin 24+ ARM64/x86_64).
2. **PostgreSQL**: Version 16 or 17 with `pgvector` extension installed (`CREATE EXTENSION IF NOT EXISTS vector;`).
3. **Temporal Cluster**: Running Temporal Frontend and History services (v1.22+). Default dev port: `7233`.
4. **Python**: Version 3.11, 3.12, or 3.13 with a virtual environment (`.venv`).
5. **Node.js**: Version 18.x or 20.x LTS with `npm`.
6. **Model Weights**: `BAAI/bge-small-en-v1.5` weights pre-downloaded to a persistent path on disk (e.g. `/opt/models/bge-small-en-v1.5`).

---

## 2. Environment Configuration

Create a deployment configuration file (e.g. `/etc/workbyline/workbyline.env` or `.env.staging`):

```bash
# Database Configuration
WORKBYLINE_CONTEXT_DATABASE_URL="postgresql+psycopg://postgres:<PASSWORD>@<DB_HOST>:<DB_PORT>/<DB_NAME>"
DATABASE_URL="postgresql+psycopg://postgres:<PASSWORD>@<DB_HOST>:<DB_PORT>/<DB_NAME>"

# Storage & Security
WORKBYLINE_CONTEXT_STORAGE="/var/lib/workbyline/storage"
WORKBYLINE_CONTEXT_DELEGATION_SECRET="<SECURE_RANDOM_SECRET_MIN_32_CHARS>"

# Temporal Configuration
TEMPORAL_ADDRESS="<TEMPORAL_HOST>:7233"
WORKBYLINE_REQUIRE_TEMPORAL_READY=true

# Embedding Configuration
WORKBYLINE_EMBEDDING_WEIGHTS="/opt/models/bge-small-en-v1.5"
WORKBYLINE_EMBEDDING_MODEL="bge-small-en-v1.5"
WORKBYLINE_EMBEDDING_REVISION="5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"
WORKBYLINE_EMBEDDING_CONFIG_SHA256="094f8e891b932f2000c92cfc663bac4c62069f5d8af5b5278c4306aef3084750"
WORKBYLINE_EMBEDDING_ARTIFACT_SHA256="5650b43c69a52dc94d243256be3a974a8836090b043531cec56ae64ac2fc3d0a"

# Network & Ports
API_PORT=8011
WEB_PORT=3004
WORKBYLINE_CONTEXT_SERVICE_URL="http://127.0.0.1:8011"

# Safety & Feature Gates
CAREERTWIN_DRY_RUN_EMAIL=true
WORKBYLINE_GRAPH_ENABLED=false
WORKBYLINE_GENERATION_GATE=false

# DataVertex Candidate Sourcing
DATAVERTEX_API_KEY="<DATAVERTEX_API_KEY>"
DATAVERTEX_MAX_CREDITS=20

# Worker Timings
WORKBYLINE_HEARTBEAT_INTERVAL_SEC=1.0
WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC=2.0
WORKBYLINE_LEASE_DURATION_SEC=120
WORKBYLINE_INITIAL_LEASE_SEC=60
```

---

## 3. Step-by-Step Deployment Procedure

### Step 1: Extract Release Candidate Package
```bash
mkdir -p /opt/workbyline-v3
cd /opt/workbyline-v3
unzip /path/to/WorkByLine_V3_Implementation_Candidate_<sha>.zip
sha256sum -c MANIFEST_SHA256.txt
```

### Step 2: Install Python & Node Dependencies
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd apps/web
npm ci
npm run build
cd ../..
```

### Step 3: Run Database Migrations (Advisory-Locked)
```bash
# Verify disposable/target database guard and apply migrations 000 -> 009
./infra/scripts/launch_workbyline_v3.sh db
```
The migration runner acquires a session-level PostgreSQL advisory lock (`8492041`), verifies forward checksums, reconciles historical variations in `schema_migration_reconciliations`, seeds synthetic tenant bindings, and safely releases the lock.

### Step 4: Launch Application Subsystems
```bash
# Launch Temporal server (if local), Dispatcher, Worker, API, and Next.js Web
./infra/scripts/launch_workbyline_v3.sh all
```

### Step 5: Verify Health & Operational Readiness
```bash
curl -s http://127.0.0.1:8011/health | jq .
```
Expected output:
```json
{
  "status": "ready",
  "service": "workbyline-context-evidence",
  "liveness": "alive",
  "operational_readiness": {
    "database": "connected",
    "schema": "ready",
    "schema_version": "009_datavertex_transactional_shortlist_and_credit_ledger.sql",
    "temporal": "ready",
    "temporal_worker_pollers": 1,
    "embedding": "ready",
    "graph": "disabled",
    "generation": "unconfigured",
    "erasure_recovery": "ready"
  }
}
```

Verify Next.js web application readiness:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3004
# Expected: 200
```

---

## 4. Operational Monitoring & Diagnostics

### Subsystem Status
```bash
./infra/scripts/launch_workbyline_v3.sh status
```

### Log Inspection
- **Temporal Server**: `logs/services/temporal.log`
- **Continuous Dispatcher**: `logs/services/dispatcher.log`
- **Continuous Document Worker**: `logs/services/worker.log`
- **Memory & Evidence API**: `logs/services/api.log`
- **Next.js Web Frontend**: `logs/services/web.log`

### Physical Erasure Recovery
If the server crashed during an ongoing document erasure, run the durable recovery CLI:
```bash
./infra/scripts/launch_workbyline_v3.sh recover-erasure
```

---

## 5. Rollback Procedures

If a fatal regression occurs during staging validation, roll back cleanly:

```bash
# 1. Stop all active V3 candidate processes
./infra/scripts/launch_workbyline_v3.sh stop

# 2. Extract verified historical rollback archive
tar -xzf rollback/careertwin_core08_app_archive.tar.gz -C /opt/workbyline-v3/

# 3. Restore database snapshot (if applicable)
pg_restore -h <DB_HOST> -p <DB_PORT> -U postgres -d <DB_NAME> --clean /path/to/backup.dump
```

