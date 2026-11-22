# Step 4B2.1D1 Documentation Corrections

**Supersedes:** Inaccurate statements in `docs/architecture/checkpoints/step4b2-1d1/` artifacts.  
**Date:** July 31, 2026  
**Authority:** Founder review decision, July 31, 2026.  

---

## 1. Entity Error Total Correction

**Incorrect statement** (in STEP4B2_1D1_SUMMARY.md, APPLICATION_LINT_AFTER_ENTITY_REPAIR.md, ENTITY_ERROR_BASELINE.md):
> "All 22 global entity errors were fixed" / "verified that all 22 unescaped entity errors in the target files were resolved"

**Correct statement:**
- Step 4B2.1D1 fixed **21 of 22** `react/no-unescaped-entities` errors.
- 1 error remained in `app/about/page.jsx:19`. The exact source sentence was: `References don't check out. We built CareerTWiN to fix it.` The apostrophe in `don't` was the unescaped character.
- The final remaining entity error was fixed in **Step 4B2.1D1.1** (commit `style(web): finish JSX entity cleanup`). The corrected sentence reads: `References don&apos;t check out. We built CareerTWiN to fix it.`
- The phrase `Don't just hire...` previously noted as the context in the ESLint baseline was an inaccurate approximation. The authoritative source of truth is `git show fe4587d -- apps/web/app/about/page.jsx`.

---

## 2. Route Count Correction

**Incorrect statement** (in NEXT_BUILD_ROUTE_TABLE.md, POST_ENTITY_REPAIR_BUILD_REPORT.md):
> "31 non-API routes compiled" / "31 / 31 routes generated cleanly" treated as a page-route count.

**Correct source-of-truth values:**
- **21 application page routes** (user-defined Next.js App Router pages)
- **28 API route-handler paths** (route.js server handlers)
- **`/_not-found`** is a framework-generated internal route, not an application page
- **31/31** appearing in build output (`Generating static pages (31/31)`) is a build-generation count that includes `/_not-found` and other framework internals — it must **not** be cited as the application page count.

---

## 3. Visible Text Equivalence Wording Correction

**Incorrect statement** (in VISIBLE_TEXT_EQUIVALENCE_REPORT.md):
> "All entity corrections provide 100% byte-for-byte visual text rendering equivalence when decoded by the browser layout engine."

**Correct statement:**
- The JSX source syntax was **intentionally changed** (raw `'` and `"` characters replaced with `&apos;` and `&quot;` HTML entities).
- The **browser-rendered visible text** produced by these entity representations is **equivalent** — the browser decodes these entities identically to their raw character counterparts.
- The phrase "byte-for-byte" is incorrect because the source bytes **did** change. Only the rendered output is equivalent.

---

## 4. Process Deviation Record: `npx` Usage

**Statement of deviation:**
- During Step 4B2.1D1 Part 4 (targeted lint) and Part 5 (application-wide lint recheck), `npx eslint` was used instead of `npm exec --offline eslint --` as required by the task instructions.

**Impact assessment:**
- No new packages were downloaded or installed.
- No `package.json` or `package-lock.json` change resulted.
- The ESLint output produced was valid and from the locally installed ESLint binary.

**Corrective requirement (enforceable in all future tasks):**
- Use `npm exec --offline eslint --` or `./node_modules/.bin/eslint` exclusively.
- `npx` must **not** be used for any lint, test, or build command in CareerTWiN monorepo tasks.
