# Typewriter Effect Documentation Corrections

**Task:** Step 4B2.1D2C-A  
**Supersedes:** Inaccurate or unsupported statements in `docs/architecture/checkpoints/step4b2-1d2b/` artifacts (`TYPEWRITER_STATE_MACHINE_ANALYSIS.md`, `TYPEWRITER_PROPOSED_DIFF.md`, `STEP4B2_1D2B_SUMMARY.md`).  
**Date:** August 1, 2026  

---

## 1. Render Timing Wording Correction

**Superseded Statement:**  
> "The state update occurred during render."

**Correct Statement:**  
> "The state updates occurred synchronously inside an Effect, forcing an avoidable additional render cycle."

**Rationale:**  
Executing `setDeleting(false)` and `setWordIdx(...)` synchronously inside the body of `useEffect` is an effect-body state update, not an inline component render body execution. React executes effect bodies after layout/paint, which then immediately queues and forces a second, avoidable render pass.

---

## 2. Strict Mode Claim Correction

**Superseded Statement:**  
> "Strict Mode skipped every second word" or "wordIdx definitely incremented twice."

**Correct Statement:**  
> "Moving the transition into the managed timer callback improves effect cleanup and determinism under Strict Mode. The submitted evidence did not prove that the original implementation skipped every second word."

**Rationale:**  
While synchronous state updates inside effects can interact poorly with React 18 strict mode double-invocations, the empirical evidence submitted did not prove that `wordIdx` actually double-incremented or skipped words in browser usage. The claim of definite word-skipping is qualified and superseded.

---

## 3. Animation Timing Correction

**Superseded Statement:**  
> "The repair adds another speed / 2 delay."

**Correct Statement:**  
> "The transition is completed inside the existing final speed / 2 deletion tick. No additional deletion tick or meaningful animation delay is introduced."

**Rationale:**  
When `charIdx === 1`, the final deletion timer callback now directly resets `display` to `""`, `deleting` to `false`, `wordIdx` to `w + 1`, and `charIdx` to `0` in a single batch. This happens during the `speed / 2` timer tick that was already scheduled for the last character deletion. It does not append an extra timer cycle or add delay to the animation sequence.
