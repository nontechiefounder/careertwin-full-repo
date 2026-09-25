# Swagger UI UAT Verification Report

This report documents the manual verification of all AI tasks and embeddings executed within the FastAPI Swagger UI at `http://localhost:8000/docs`.

## Executive Summary

We triggered the browser subagent to interact directly with the FastAPI Swagger page, fill in the custom development headers, submit the request body payloads, and capture responses.

All endpoints returned **HTTP 200 OK** and valid JSON formats.

## Web Browser Interaction Session
Below is the recorded video animation of the automated browser testing session:

![Swagger UAT Session Recording](file:///Users/darshilparmar/.gemini/antigravity-ide/brain/06a44bd3-286a-4d30-ac33-eca806d0a73e/swagger_uat_testing_1783939972604.webp)

---

## Detailed Test Case Screen Captures

### Test 1: `role_decomposer`
* **Goal:** Decompose the Senior Backend Engineer job description into requirements.
* **Execution:** Sent input text to `POST /v1/ai/tasks/role_decomposer/test`.
* **Result:** HTTP 200. Generated requirement mappings correctly.

![Role Decomposer Response](file:///Users/darshilparmar/.gemini/antigravity-ide/brain/06a44bd3-286a-4d30-ac33-eca806d0a73e/test1_response_1783940037677.png)

![Role Decomposer Response Body Details](file:///Users/darshilparmar/.gemini/antigravity-ide/brain/06a44bd3-286a-4d30-ac33-eca806d0a73e/test1_response_body_1783940043039.png)

---

### Test 2: `evidence_extractor`
* **Goal:** Extract raw claims from the candidate's resume and link them to coordinates.
* **Execution:** Sent resume text to `POST /v1/ai/tasks/evidence_extractor/test`.
* **Result:** HTTP 200. Extracted the key candidate milestones.

![Evidence Extractor Response](file:///Users/darshilparmar/.gemini/antigravity-ide/brain/06a44bd3-286a-4d30-ac33-eca806d0a73e/test2_response_1783940104021.png)

---

### Test 3: `match_analyst`
* **Goal:** Match extracted resume claims against the role requirements.
* **Execution:** Sent claims and requirements to `POST /v1/ai/tasks/match_analyst/test`.
* **Result:** HTTP 200. Evaluated requirement fulfillment status.

![Match Analyst Response](file:///Users/darshilparmar/.gemini/antigravity-ide/brain/06a44bd3-286a-4d30-ac33-eca806d0a73e/test3_response_final_1783940225175.png)

---

## Technical Files Links
* [Swagger UAT Test Run Script](file:///Users/darshilparmar/Downloads/CareerTWiN_Backend_Starter_Kit%20%283%29%202/scripts/run_live_acceptance_tests.py)
* [UAT Verdict Report](file:///Users/darshilparmar/Downloads/CareerTWiN_Backend_Starter_Kit%20%283%29%202/scripts/live_acceptance_test_results.md)
