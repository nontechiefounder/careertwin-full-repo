# Step 4B1 Destination Secret Scan Report

**Scan Target:** `careertwin-monorepo/apps/web`  
**Scan Method:** Documented Static Regex Pattern Scanning (Fallback scanner; no dedicated scanner tool installed)  
**Date:** July 31, 2026  
**Status:** Clean — ZERO Secret Keys, Credentials, or Tokens Discovered  

---

## 1. Static Scanning Methodology & Limitations

Because no dedicated external secret-scanning tool (such as Trufflehog or Gitleaks) is installed in the local environment, a static regex pattern audit was executed across all 147 files in `careertwin-monorepo/apps/web`.

**Disclaimer:** This static pattern scan evaluates current file text against high-confidence credential regexes. It is a fallback scan and is not equivalent to a full deep historical repository scanner.

---

## 2. Scan Target & Pattern Categories

- **AWS / Cloud Provider Credentials:** (`AKIA...`) — 0 matches
- **Private RSA / EC / SSH Keys:** (`-----BEGIN PRIVATE KEY-----`) — 0 matches
- **Hardcoded API Keys & Tokens:** (`api_key = "..."`) — 0 matches
- **Hardcoded Database Passwords:** (`password = "..."`) — 0 matches
- **Candidate PII / Real Resumes:** — 0 candidate documents copied

---

## 3. Audited Findings Detail

- **Scanned File Count:** 147 files
- **Matched Findings:** 1 rule hit (`lib/supabaseServer.js:8` matching `Bearer Token` pattern).
- **Finding Analysis:** Line 8 of `lib/supabaseServer.js` contains a source code comment:  
  `// 1. Check for Bearer token (API calls)`  
  This was verified to be a false-positive code comment matching the word `Bearer`. No actual secret token exists.

---

## 4. Conclusion

Destination `careertwin-monorepo/apps/web` contains zero hardcoded API keys, secrets, or candidate PII. `.env.example` contains blank variable names only.
