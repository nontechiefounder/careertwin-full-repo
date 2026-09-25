# Employer API Mock Repair Documentation

**Target Test File:** `apps/web/__tests__/api/employer.test.js`  
**Production Route:** `apps/web/app/api/employer/hiring-runs/route.js`  
**Date:** July 31, 2026  

---

## 1. Production Route Supabase Chain Analysis

In `app/api/employer/hiring-runs/route.js`, the `POST` handler executes:
```javascript
const { data, error } = await supabase
  .from('hiring_runs')
  .insert([newRun])
  .select()
  .single();
```

---

## 2. Test Mock Failure Analysis & Repair

- **Stale Mock Behavior:** The original test mock configured `insertMock = vi.fn().mockResolvedValue(...)` directly, causing `.select()` chaining to throw `TypeError: supabase.from(...).insert(...).select is not a function`.
- **Repaired Mock Chain:** Updated `insertMock` to return `{ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'run-789' }, error: null }) }) }`.
- **Assertions:** Preserved 200 HTTP status check, `data.hiring_run_id` field verification, and `insertMock` payload object matching assertions intact.
