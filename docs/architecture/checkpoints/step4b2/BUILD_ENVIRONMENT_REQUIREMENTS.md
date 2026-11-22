# Build Environment Requirements & Static Variable Map

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  

---

## 1. Referenced Environment Variables Map

Extracted via static source code analysis:
- `NEXT_PUBLIC_SUPABASE_URL` (Public Supabase project URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Public Supabase client anonymous key)
- `SUPABASE_SERVICE_ROLE_KEY` (Server Supabase service key)
- `GEMINI_API_KEY` (Google Gemini AI API key)
- `CRUSTDATA_API_KEY` (Crustdata candidate search API key)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (Email server configuration)
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (Gmail API credentials)

*(Note: No secret values or environment files were opened or copied).*

---

## 2. Module Import & Build Behavior Assessment

- **Supabase SDK Instantiation:** `lib/supabase.js` and `lib/supabaseServer.js` invoke `@supabase/supabase-js` `createClient(url, key)` during module import.
- **Build Compilation Requirements:** Next.js static page generation and server bundle creation require valid URL format for `NEXT_PUBLIC_SUPABASE_URL` (e.g. `http://localhost:54321`) to instantiate the client without crashing static compilation.
- **External Provider Isolation:** Build and local execution must operate strictly against safe localhost placeholders without contacting remote cloud services.
