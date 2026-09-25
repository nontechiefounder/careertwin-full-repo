# Founder Build Protocol & Change Governance

This document establishes the mandatory risk classification protocol for all code, schema, and architectural changes within the CareerTWiN repository.

---

## Change Risk Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                    FOUNDER BUILD PROTOCOL                       │
├─────────────────────────────────────────────────────────────────┤
│  🟢 GREEN  │ Low Risk     │ Autonomous execution allowed        │
│  🟡 AMBER  │ Medium Risk  │ Explicit plan review required       │
│  🔴 RED    │ High Risk    │ Mandatory founder approval required │
└─────────────────────────────────────────────────────────────────┘
```

---

### 🟢 GREEN (Low Risk — Autonomous Execution Permitted)
Changes in this category are non-destructive and isolated. Agents may perform these changes autonomously:
- Writing or updating documentation (`docs/`, `README.md`, `AGENTS.md`)
- Creating isolated unit or integration tests that do not alter application state
- Creating empty scaffolding, directory structures, or boilerplate files
- Implementing feature-flagged, mock-only UI components in local environments

---

### 🟡 AMBER (Medium Risk — Plan Review & Verification Required)
Changes in this category impact core framework structures or business logic. Agents MUST present a plan and obtain review before execution:
- Adding or upgrading project dependencies
- Modifying internal API contracts or shared TypeScript/Pydantic schemas
- Modifying authentication or authorization routines
- Altering database schemas or adding Alembic migrations
- Modifying core AI prompt logic, workflow pipelines, or evaluation engines
- Changing existing page routes or visual UI navigation flows

---

### 🔴 RED (High Risk — Explicit Founder Approval Mandatory)
Changes in this category carry operational, security, legal, or data integrity risks. **NO AGENT MAY EXECUTE RED ACTIONS WITHOUT EXPLICIT WRITTEN FOUNDER APPROVAL:**
- Executing production deployments or cloud release pipelines
- Running destructive database migrations or dropping tables/columns
- Modifying production credentials, secret environment variables, or security keys
- Using database `SERVICE_ROLE_KEY` or admin superuser credentials in client-facing code
- Importing real production data or un-sanitized candidate records
- Enabling automatic candidate rejections, automatic hiring decisions, or auto-emails
- Executing git force pushes (`git push --force`) or direct un-reviewed pushes to `main` branch
