# Legacy Component Register

**Component:** `apps/web/components/NaiveShell.jsx`  
**Registration Date:** July 31, 2026  
**Status:** Retained Temporarily for Frontend Parity  

---

## Governance Rules & Future Roadmap

1. **Temporary Retention:**  
   `NaiveShell.jsx` is retained temporarily in `apps/web/components/` solely to maintain visual navigation layout parity and avoid breaking import statements in 14 page components during the frontend copy phase.

2. **No Expansion:**  
   `NaiveShell.jsx` must NOT be expanded, refactored, or loaded with additional feature logic.

3. **Future Component Refactoring Boundary:**  
   In subsequent build milestones, the visual layout shell (`NaiveShell`) and brand mark (`CTLogo`) will be refactored into modular components without touching core application pages prematurely.

4. **Legacy Logic Replacement Constraint:**  
   Any legacy client-side UI assumptions or hardcoded mock fallback states present in legacy layout wrappers are strictly classified as temporary UI placeholders. They must ultimately be driven by the structured Python FastAPI backend service and formal domain API contracts.

5. **Zero Refactoring in Step 4B1.1:**  
   No source refactoring, code editing, or structural modification has occurred in this task.
