# Step 4B2.1D2A Rollback Guide

**Rollback target:** `step4b2-1d2a-pre-chat-date-fix` (= `89259d2`)

---

## 1. Safety Boundaries

- Operates strictly inside `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo`
- No remote exists; no push operations are possible
- Pre-change tag `step4b2-1d2a-pre-chat-date-fix` is a permanent lightweight tag pointing to `89259d2`

---

## 2. Rollback Commands

Execute from inside `careertwin-monorepo`:

```bash
# 1. Confirm working directory
pwd

# 2. Preview what git clean would remove (dry-run first)
git clean -ndx -- apps/web/.next

# 3. Reset HEAD and working tree to the pre-change baseline
git reset --hard step4b2-1d2a-pre-chat-date-fix

# 4. Remove build artifacts
git clean -fdx -- apps/web/.next
```

After rollback, `apps/web/app/employer/chat/page.jsx` line 224 will contain the original:
```jsx
{new Date(run.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
```
