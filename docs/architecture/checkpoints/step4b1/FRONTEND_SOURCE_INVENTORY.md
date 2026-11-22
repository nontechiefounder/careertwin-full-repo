# Frontend Source Inventory & Analysis

**Source Directory:** `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/01-live-mvp-readonly`  
**Target Destination:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  

---

## 1. Technical Framework & Package Manager

- **Framework:** Next.js `16.2.1` (App Router structure)
- **UI Core:** React `19.0.0`, React DOM `19.0.0`
- **Styling System:** Tailwind CSS `v4.2.2`, `@tailwindcss/postcss` `4.2.2`, Autoprefixer `10.4.27`
- **Inferred Package Manager:** `npm` (Inferred from `package-lock.json` lockfileVersion 3)

---

## 2. Application Route Map (`app/`)

### Public & Marketing Pages
- `/` — Main Product Landing Page (`app/page.jsx`)
- `/about` — About Page (`app/about/page.jsx`)
- `/contact` — Contact Page (`app/contact/page.jsx`)
- `/pricing` — Pricing Page (`app/pricing/page.jsx`)
- `/privacy` — Privacy Policy (`app/privacy/page.jsx`)
- `/terms` — Terms of Service (`app/terms/page.jsx`)
- `/compare` — Competitor Comparison Page (`app/compare/page.jsx`)

### Authentication Pages
- `/auth` — Auth Landing Page (`app/auth/page.jsx`)
- `/auth/login` — Sign In Form (`app/auth/login/page.jsx`)
- `/auth/signup` — Registration Form (`app/auth/signup/page.jsx`)

### Employer Workspace Pages
- `/employer` — Employer Dashboard (`app/employer/page.jsx`)
- `/employer/intake` — Role Intake Form (`app/employer/intake/page.jsx`)
- `/employer/brief/[id]` — Role Brief Viewer (`app/employer/brief/[id]/page.jsx`)
- `/employer/shortlist/[roleId]` — Candidate Shortlist (`app/employer/shortlist/[roleId]/page.jsx`)
- `/employer/packet/[extractionId]` — Candidate Decision Packet (`app/employer/packet/[extractionId]/page.jsx`)
- `/employer/sourcing-session/[id]` — Candidate Sourcing View (`app/employer/sourcing-session/[id]/page.jsx`)
- `/employer/integrations` — ATS & Sourcing Hub (`app/employer/integrations/page.jsx`)
- `/employer/profile` — Employer Settings (`app/employer/profile/page.jsx`)
- `/employer/chat` — AI Assistant Chat (`app/employer/chat/page.jsx`)

### Candidate Portal Pages
- `/candidate/onboarding` — Candidate Onboarding (`app/candidate/onboarding/page.jsx`)
- `/candidate/proof-profile/[candidateId]` — Candidate Proof Profile (`app/candidate/proof-profile/[candidateId]/page.jsx`)
- `/candidate/screen/[sessionId]` — Screening Session (`app/candidate/screen/[sessionId]/page.jsx`)
- `/candidate/status/[candidateId]` — Application Status (`app/candidate/status/[candidateId]/page.jsx`)

---

## 3. API Route Handlers (`app/api/`)

- `/api/auth/session` — Session verification endpoint (`app/api/auth/session/route.js`)
- `/api/candidate/profile` — Candidate profile management (`app/api/candidate/profile/route.js`)
- `/api/employer/brief` — Role brief processing (`app/api/employer/brief/route.js`)
- `/api/employer/intake` — Role intake handling (`app/api/employer/intake/route.js`)
- `/api/employer/packet` — Candidate decision packet retrieval (`app/api/employer/packet/route.js`)
- `/api/employer/shortlist` — Shortlist candidate scoring (`app/api/employer/shortlist/route.js`)
- `/api/integrations/crustdata` — Crustdata candidate search proxy (`app/api/integrations/crustdata/route.js`)
- `/api/search` — Global search API endpoint (`app/api/search/route.js`)

---

## 4. UI Components (`components/`)

- **Shadcn UI Primitives (46 files in `components/ui/`):** `accordion.jsx`, `alert-dialog.jsx`, `alert.jsx`, `aspect-ratio.jsx`, `avatar.jsx`, `badge.jsx`, `breadcrumb.jsx`, `button.jsx`, `calendar.jsx`, `card.jsx`, `carousel.jsx`, `checkbox.jsx`, `collapsible.jsx`, `command.jsx`, `context-menu.jsx`, `dialog.jsx`, `drawer.jsx`, `dropdown-menu.jsx`, `form.jsx`, `hover-card.jsx`, `input-otp.jsx`, `input.jsx`, `label.jsx`, `menubar.jsx`, `navigation-menu.jsx`, `pagination.jsx`, `popover.jsx`, `progress.jsx`, `radio-group.jsx`, `resizable.jsx`, `scroll-area.jsx`, `select.jsx`, `separator.jsx`, `sheet.jsx`, `skeleton.jsx`, `slider.jsx`, `sonner.jsx`, `switch.jsx`, `table.jsx`, `tabs.jsx`, `textarea.jsx`, `toast.jsx`, `toaster.jsx`, `toggle-group.jsx`, `toggle.jsx`, `tooltip.jsx`.
- **Marketing Components (`components/marketing/`):** `BackgroundBeams.jsx`, `BentoGrid.jsx`, `MarketingFooter.jsx`, `MarketingNav.jsx`, `MovingBorder.jsx`, `SpotlightCard.jsx`, `TypewriterEffect.jsx`.
- **Global Workspace Components:** `CommandPalette.jsx`, `ProtectedRoute.jsx`, `Providers.jsx`, `TechIcon.jsx`.
- **Excluded Obsolete Component:** `NaiveShell.jsx` (Requires explicit founder approval prior to copying).

---

## 5. Authentication & Sourcing Modules

### Authentication
- `lib/auth.js` — Client auth context, sign-in/up logic, token state.
- `lib/supabase.js` — Client Supabase SDK instance initialization.
- `lib/supabaseServer.js` — Server-side Supabase client with JWT handling.
- `components/ProtectedRoute.jsx` — Client route guard wrapper.

### Sourcing
- `lib/sourcing/crustdata.js` — Crustdata REST API client routines.
- `lib/sourcing/agent.js` — Candidate sourcing search agent routines.
- `lib/mcp/crustdata_tools.js` — MCP tool definitions for Crustdata search.
- `app/api/integrations/crustdata/route.js` — Crustdata API proxy endpoint.

---

## 6. Testing & Deployment Configuration

- **Testing Configuration:** `vitest.config.mjs`, `__tests__/setup.js`
- **Test Suites:** `__tests__/components/ProtectedRoute.test.js`, `__tests__/api/employer.test.js`, `__tests__/api/candidate.test.js`, `__tests__/pages/AuthPage.test.js`
- **Next.js Config:** `next.config.mjs` (`reactCompiler: true`)
- **Excluded Build Directories:** `.next/`, `.vercel/`

---

## 7. Referenced Environment Variable Names

Statically extracted from source code:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `CRUSTDATA_API_KEY`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

*(Note: No environment variable values are extracted or documented.)*

---

## 8. Source AGENTS.md Instructions

The source directory contains `AGENTS.md` with explicit guidance:
> *"This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in node_modules/next/dist/docs/ before writing any code. Heed deprecation notices."*
