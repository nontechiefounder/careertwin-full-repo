# WorkByLine V2 — Independent Code Review Record

**Candidate Range:** `2553b8374d6f034d618d37449cb914e6f4770287..df03816d07e064b195db41429654a13fd48b2653`  
**Cumulative Delta:** `84d9712..df03816d07e064b195db41429654a13fd48b2653`  
**Date:** 2026-10-25T20:45:00Z  

---

## 1. External Review Tools Attempted

Per project instruction:
> "After implementation and self-review, use CodeRabbit or a separately invoked Codex/Claude review session to inspect the complete candidate delta and relevant surrounding code. Use an already authorized account. Do not purchase credits, publish a PR or push remotely."

We executed invocations for all three candidate tools:

### Tool 1: CodeRabbit CLI
- **Command:** `which coderabbit`
- **Exit Code:** 1
- **Raw Output:** `coderabbit not found`
- **Result:** Unavailable on local environment.

### Tool 2: Claude Code CLI
- **Binary:** `/Users/darshilparmar/.local/bin/claude`
- **Command:** `/Users/darshilparmar/.local/bin/claude -p "Review git diff"`
- **Exit Code:** 1
- **Raw Output:** `Credit balance is too low`
- **Result:** Account balance exhausted. Per instructions, agent did not purchase credits.

### Tool 3: OpenAI Codex CLI
- **Binary:** `/opt/homebrew/bin/codex`
- **Command:** `/opt/homebrew/bin/codex -q "Review git diff"`
- **Exit Code:** 1
- **Raw Output:** `Missing OpenAI API key. Set the environment variable OPENAI_API_KEY and re-run this command.`
- **Result:** Missing API credential.

---

## 2. Gate Classification
- **Independent External Code Review Gate Status:** **BLOCKED (Awaiting External Reviewer Account Provisioning)**
- **Precise Prerequisite:** Top-up account credits on Anthropic account for `/Users/darshilparmar/.local/bin/claude`, or provision `OPENAI_API_KEY` for `/opt/homebrew/bin/codex`.
- **Integrity Rule:** In accordance with project instructions, internal Ponytail self-review is NOT substituted for external independent review.

---

## 3. Internal Engineering Self-Review (Ponytail & Karpathy Principles)

Internal self-review was conducted following `/Users/darshilparmar/.gemini/config/plugins/ponytail/skills/ponytail/` and `/Users/darshilparmar/.gemini/config/plugins/andrej-karpathy-skills/`:

1. **Grounding Defect (`service/qa_flow.py`):**
   - Implemented surgical entity-role checks, contrastive action binding, and number normalization.
   - Tested against 17 frozen unseen adversarial scenarios (`tests/test_unseen_grounding_eval.py`). All passed without regressions.
2. **Cross-Language Integration (`apps/web/__tests__/api/CrossLanguageLiveIntegration.test.js`):**
   - Relabeled mock tests as unit contract tests. Implemented real HTTP integration tests communicating directly with Python Memory API on port 8011. All passed.
3. **Paired Rollback Rehearsal (`infra/deployment/rehearse_paired_rollback.sh`):**
   - Upgraded script to actually boot Core-08 Next.js server on port 3008, verify HTTP reads/writes, reapply forward migrations, and recompute SHA-256 directly from stored database byte arrays. All verified.
4. **Ingestion & Retrieval Benchmark (`scripts/reproduce_benchmark.py`):**
   - Reconciled throughput metrics (Text/DOCX reaches ~500 docs/sec, exceeding $\ge 2.0$ docs/sec target). Measured p50 latency of 4.24 ms (below 120 ms target).
