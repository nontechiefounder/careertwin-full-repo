# Candidate API Mock Repair Documentation

**Target Test File:** `apps/web/__tests__/api/candidate.test.js`  
**Production Route:** `apps/web/app/api/candidate/profile/route.js`  
**Date:** July 31, 2026  

---

## 1. Production Route Supabase Chain Analysis

In `app/api/candidate/profile/route.js`, the `POST` handler executes:
```javascript
const { data, error } = await supabase
  .from('candidate_profiles')
  .upsert([profileData])
  .select()
  .single();
```

---

## 2. Test Mock Failure Analysis & Repair

- **Stale Mock Behavior:** The original test mock configured `upsert: vi.fn().mockResolvedValue(...)` directly, causing `.select()` chaining to throw `TypeError: supabase.from(...).upsert(...).select is not a function`.
- **Repaired Mock Chain:** Updated `upsert` mock to return `{ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: '[REDACTED: development credential password]', name: 'Updated Name' }, error: null }) }) }`.
- **Assertions:** Preserved 200 HTTP status check and `upsertMock` invocation assertions intact.
