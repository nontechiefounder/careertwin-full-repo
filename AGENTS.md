# AI Agent Operation Rules & Guidelines

All AI coding assistants (including Antigravity, Claude, and Gemini) operating within this repository MUST adhere strictly to the rules and invariants defined below.

---

## Mandated Operating Rules

1. **Read Nested AGENTS.md Files:**  
   Always locate and read any nested `AGENTS.md` files in subdirectories before modifying code within those directories.

2. **Next.js Breaking Changes Caution:**  
   The current Next.js installation may contain breaking API changes between major versions. Always verify local usage patterns against installed Next.js documentation before altering Next.js code.

3. **Consult Local Next.js Documentation:**  
   When modifying App Router features, server components, or route handlers, consult the official local Next.js documentation first.

4. **Preserve Package Manager & Lockfiles:**  
   Preserve existing package manager choices and lockfiles. Do not replace package managers or reconfigure lockfiles without explicit instruction.

5. **Plan Before Editing:**  
   Formulate a clear plan, verify boundaries, and obtain approval when required before editing files.

6. **Never Access Production:**  
   Never attempt to connect to, query, modify, or access production environments, live databases, or remote staging servers.

7. **Never Expose Secrets or Candidate Data:**  
   Never output, log, commit, or copy credentials, API keys, passwords, private candidate data, or environment variable values.

8. **Mandatory Human Review Gates:**  
   Human review is strictly mandatory before finalizing changes to:
   - Database schemas & migrations
   - Authentication & session handling
   - Security policies & tenant isolation rules
   - Candidate evaluation & scoring logic
   - Deployment & infrastructure manifests
