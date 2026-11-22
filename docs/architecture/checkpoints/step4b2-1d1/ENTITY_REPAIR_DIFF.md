# ESLint Entity Repair Diff & Verification

**Target Directory:** `apps/web/app/`  
**Date:** July 31, 2026  

---

## 1. Applied Syntactic Diffs

### A. `apps/web/app/auth/page.jsx`
```diff
@@ -113,1 +113,1 @@
-              "CareerTWiN cut our screening time by 70%. Every shortlist arrived with verified GitHub contributions and proof of impact. It's unlike anything we've ever used."
+              &quot;CareerTWiN cut our screening time by 70%. Every shortlist arrived with verified GitHub contributions and proof of impact. It&apos;s unlike anything we&apos;ve ever used.&quot;
```
- **Equivalence:** 100% equivalent visual rendering.
- **Risk:** Zero.

### B. `apps/web/app/candidate/onboarding/page.jsx`
```diff
@@ -79,1 +79,1 @@
-        <p className="text-sm text-white/45 mb-10">We'll use this to build your proof-first profile. The more you share, the stronger your proof.</p>
+        <p className="text-sm text-white/45 mb-10">We&apos;ll use this to build your proof-first profile. The more you share, the stronger your proof.</p>
```
- **Equivalence:** 100% equivalent visual rendering.
- **Risk:** Zero.

### C. `apps/web/app/compare/page.jsx`
```diff
@@ -64,1 +64,1 @@
-      <p className="text-[13px] text-white/55 leading-relaxed italic flex-1">"{t.quote}"</p>
+      <p className="text-[13px] text-white/55 leading-relaxed italic flex-1">&quot;{t.quote}&quot;</p>
@@ -95,1 +95,1 @@
-            Traditional hiring is a game of telephone. Resumes lie. Phone screens waste time. References don't check out. CareerTWiN replaces all of it with verified proof.
+            Traditional hiring is a game of telephone. Resumes lie. Phone screens waste time. References don&apos;t check out. CareerTWiN replaces all of it with verified proof.
```
- **Equivalence:** 100% equivalent visual rendering.
- **Risk:** Zero.

### D. `apps/web/app/contact/page.jsx`
```diff
@@ -15,1 +15,1 @@
-            Let's talk <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">hiring.</span>
+            Let&apos;s talk <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">hiring.</span>
```
- **Equivalence:** 100% equivalent visual rendering.
- **Risk:** Zero.

### E. `apps/web/app/employer/intake/page.jsx`
```diff
@@ -460,1 +460,1 @@
-                  CareerTWiN's AI will parse your requirements and create a structured brief. The brief guides the sourcing agent to find verified candidates.
+                  CareerTWiN&apos;s AI will parse your requirements and create a structured brief. The brief guides the sourcing agent to find verified candidates.
```
- **Equivalence:** 100% equivalent visual rendering.
- **Risk:** Zero.

### F. `apps/web/app/employer/page.jsx`
```diff
@@ -160,1 +160,1 @@
-                Your agency-grade AI hiring engine is ready. Let's get you started with your first verified sourcing run.
+                Your agency-grade AI hiring engine is ready. Let&apos;s get you started with your first verified sourcing run.
@@ -192,1 +192,1 @@
-                    Click <span className="text-white font-medium">"New Role"</span> to upload a JD. Our AI immediately weights skills.
+                    Click <span className="text-white font-medium">&quot;New Role&quot;</span> to upload a JD. Our AI immediately weights skills.
```
- **Equivalence:** 100% equivalent visual rendering.
- **Risk:** Zero.

### G. `apps/web/app/employer/sourcing-session/[id]/page.jsx`
```diff
@@ -469,1 +469,1 @@
-                    I'll keep you updated as profiles are scanned and evaluated.
+                    I&apos;ll keep you updated as profiles are scanned and evaluated.
```
- **Equivalence:** 100% equivalent visual rendering.
- **Risk:** Zero.

### H. `apps/web/app/privacy/page.jsx`
```diff
@@ -14,1 +14,1 @@
-          <p>CareerTWiN ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how your personal information is collected, used, and disclosed by CareerTWiN.</p>
+          <p>CareerTWiN (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how your personal information is collected, used, and disclosed by CareerTWiN.</p>
```
- **Equivalence:** 100% equivalent visual rendering.
- **Risk:** Zero.

### I. `apps/web/app/terms/page.jsx`
```diff
@@ -17,1 +17,1 @@
-          <p>Permission is granted to temporarily download one copy of the materials on CareerTWiN's website for personal, non-commercial transitory viewing only.</p>
+          <p>Permission is granted to temporarily download one copy of the materials on CareerTWiN&apos;s website for personal, non-commercial transitory viewing only.</p>
```
- **Equivalence:** 100% equivalent visual rendering.
- **Risk:** Zero.
