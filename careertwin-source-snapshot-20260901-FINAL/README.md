# CareerTWiN Monorepo Foundation

Welcome to the **CareerTWiN** monorepo repository structure.

## Current Build Status

- **Phase:** Foundation Only (Step 4A)
- **Application State:** No application code has been migrated yet.
- **Environment State:** No production environment, database, or live infrastructure is connected.
- **Source Folders:** `01-live-mvp-readonly`, `02-backend-starter-readonly`, `03-ip-specs-readonly`, and `04-golden-dataset-readonly` remain strictly read-only reference sources.

---

## Directory Architecture & Overview

```text
careertwin-monorepo/
├── apps/
│   └── web/                    # Reserved for Next.js 16 employer & candidate web application
├── services/
│   ├── api/                    # Reserved for FastAPI HTTP backend service
│   └── worker/                 # Reserved for Celery background asynchronous worker
├── packages/
│   ├── shared-contracts/       # Reserved for shared API contracts & domain interfaces
│   ├── ui/                     # Reserved for future shared UI component primitives
│   ├── hiring-genome/          # Reserved for hiring genome compiler logic
│   └── proof-engine/           # Reserved for proof contract & claim verification engine
├── evals/
│   ├── golden/
│   │   └── v2/                # Reserved for Golden Dataset v2 benchmark suites
│   └── safety/                 # Reserved for bias-invariance & safety test suites
├── docs/
│   ├── architecture/           # Architecture decision records & review corrections
│   ├── product/                # Product specifications & requirement mappings
│   ├── security/               # Security policies, threat models & isolation plans
│   └── private/
│       └── ip-specs/           # Reserved for private 100-spec IP documentation
├── infra/
│   ├── database/               # Reserved for database schemas & Alembic migrations
│   ├── deployment/             # Reserved for containerization & infrastructure manifests
│   └── monitoring/             # Reserved for telemetry & health monitoring configs
├── README.md                   # Repository overview and structural guide
├── AGENTS.md                   # AI Agent operation guidelines & invariants
├── FOUNDER_BUILD_PROTOCOL.md   # Change governance (Green, Amber, Red categories)
├── .gitignore                  # Git ignore policy enforcing security & artifact exclusions
└── .env.example                # Structural environment variable template (no values)
```

---

## Development Constraints

1. **No Code Migration in Step 4A:** This stage establishes directory structure and protocol files only.
2. **Read-Only Sources:** All source files under folders 1–4 are immutable.
3. **Human Governance:** All schema, authentication, API, security, and deployment changes require explicit human review.
