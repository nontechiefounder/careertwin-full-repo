"""
Unseen Grounding Evaluation Benchmark Suite.
Tests entity swaps, quantities, negation, collective vs individual ownership,
conflicting evidence, valid paraphrases, and unsupported extra clauses.
Computes and reports False Acceptance Rate (FAR) and False Rejection Rate (FRR).
"""
import pytest
from service.qa_flow import build_qa_flow

# ─────────────────────────────────────────────────────────────────────────────
# FROZEN EVALUATION DATASET
# ─────────────────────────────────────────────────────────────────────────────
FROZEN_EVALUATION_CASES = [
    # ── Category 1: Entity Swaps & Relational Inversion (Expect REJECTION) ──
    {
        "id": "entity_swap_mentor_01",
        "category": "entity_swap",
        "expected_supported": False,
        "source": "Alice mentored Bob.",
        "answer": "Bob mentored Alice.",
        "description": "Reversed mentor-mentee relationship",
    },
    {
        "id": "entity_swap_manage_02",
        "category": "entity_swap",
        "expected_supported": False,
        "source": "Carol managed Dave on the infrastructure team.",
        "answer": "Dave managed Carol on the infrastructure team.",
        "description": "Reversed managerial relationship",
    },
    {
        "id": "entity_swap_attrib_03",
        "category": "entity_swap",
        "expected_supported": False,
        "source": "Eve architected the payment service. Frank wrote documentation.",
        "answer": "Frank architected the payment service.",
        "description": "Attributing architect role to documentation writer",
    },

    # ── Category 2: Action-Object & Contrastive Mismatch (Expect REJECTION) ──
    {
        "id": "action_contrast_01",
        "category": "action_contrast",
        "expected_supported": False,
        "source": "Candidate evaluated Python but deployed Go.",
        "answer": "Candidate deployed Python.",
        "description": "Attributing deployed action to evaluated technology",
    },
    {
        "id": "action_contrast_02",
        "category": "action_contrast",
        "expected_supported": False,
        "source": "Candidate designed the Kafka cluster but rejected RabbitMQ.",
        "answer": "Candidate deployed RabbitMQ.",
        "description": "Asserting deployment for rejected technology",
    },

    # ── Category 3: Quantity Claims & Word Paraphrases ──
    {
        "id": "quantity_paraphrase_valid_01",
        "category": "quantity_paraphrase",
        "expected_supported": True,
        "source": "Candidate has 5 years of Python experience.",
        "answer": "Candidate has five years of Python experience.",
        "description": "Word paraphrase 'five' matching digit '5'",
    },
    {
        "id": "quantity_paraphrase_valid_02",
        "category": "quantity_paraphrase",
        "expected_supported": True,
        "source": "Candidate delivered three microservices in production.",
        "answer": "Candidate delivered 3 microservices in production.",
        "description": "Digit '3' matching word paraphrase 'three'",
    },
    {
        "id": "quantity_mismatch_invalid_01",
        "category": "quantity_mismatch",
        "expected_supported": False,
        "source": "Candidate has 5 years of Python experience.",
        "answer": "Candidate has 10 years of Python experience.",
        "description": "Unsupported inflated numerical experience (10 vs 5)",
    },
    {
        "id": "quantity_mismatch_invalid_02",
        "category": "quantity_mismatch",
        "expected_supported": False,
        "source": "Candidate has 5 years of Python experience.",
        "answer": "Candidate has ten years of Python experience.",
        "description": "Unsupported inflated word experience ('ten' vs 5)",
    },

    # ── Category 4: Negation & Polarity Contradiction (Expect REJECTION) ──
    {
        "id": "negation_contradiction_01",
        "category": "negation",
        "expected_supported": False,
        "source": "Candidate did not deploy Kubernetes in production.",
        "answer": "Candidate deployed Kubernetes in production.",
        "description": "Affirming an explicitly negated production deployment",
    },
    {
        "id": "negation_contradiction_02",
        "category": "negation",
        "expected_supported": False,
        "source": "Candidate maintains Linux servers without Docker.",
        "answer": "Candidate maintains Linux servers with Docker.",
        "description": "Asserting Docker usage when citation states 'without Docker'",
    },

    # ── Category 5: Collective vs Individual Ownership (Expect REJECTION) ──
    {
        "id": "ownership_hijack_01",
        "category": "ownership",
        "expected_supported": False,
        "source": "The team delivered 10 database migrations.",
        "answer": "Candidate independently completed 10 migrations.",
        "description": "Claiming independent delivery of collective team migrations",
    },
    {
        "id": "ownership_hijack_02",
        "category": "ownership",
        "expected_supported": False,
        "source": "Our group authored the architectural RFC.",
        "answer": "Candidate solely authored the architectural RFC.",
        "description": "Claiming sole authorship of group RFC",
    },

    # ── Category 6: Valid Technical Paraphrases (Expect ACCEPTANCE) ──
    {
        "id": "valid_paraphrase_tech_01",
        "category": "valid_paraphrase",
        "expected_supported": True,
        "source": "Candidate has 5 years of Python programming experience.",
        "answer": "Candidate has 5 years of Python development experience.",
        "description": "Synonym paraphrase 'development' for 'programming'",
    },
    {
        "id": "valid_exact_02",
        "category": "valid_paraphrase",
        "expected_supported": True,
        "source": "Candidate led the migration of legacy services to PostgreSQL.",
        "answer": "Candidate led the migration of legacy services to PostgreSQL.",
        "description": "Exact faithful citation reproduction",
    },

    # ── Category 7: Unsupported Extra Clause (Expect REJECTION or WITHHOLDING) ──
    {
        "id": "unsupported_extra_clause_01",
        "category": "unsupported_extra",
        "expected_supported": False,
        "source": "Candidate has Python experience.",
        "answer": "The candidate has Python experience and security clearance.",
        "description": "Ungrounded security clearance appended to supported claim",
    },
]


@pytest.mark.parametrize("case", FROZEN_EVALUATION_CASES, ids=lambda c: c["id"])
def test_frozen_grounding_eval_case(case):
    passages = [{
        "span_id": f"span_{case['id']}",
        "source_id": f"src_{case['id']}",
        "version_id": f"ver_{case['id']}",
        "text": case["source"],
    }]

    def generator(*args):
        return {
            "answer": case["answer"],
            "status": "GROUNDED",
            "citations": [{
                "span_id": f"span_{case['id']}",
                "source_id": f"src_{case['id']}",
                "version_id": f"ver_{case['id']}",
                "quote": case["source"],
            }],
            "has_validation_errors": False,
        }

    flow = build_qa_flow(lambda q: {"passages": passages}, generator)
    result = flow.invoke({"question": f"Query for {case['id']}"})["output"]

    if case["expected_supported"]:
        # Ground-truth positive: Must be accepted as GROUNDED with has_validation_errors=False
        assert result["status"] == "GROUNDED", f"False Rejection on {case['id']}: expected GROUNDED, got {result['status']}"
        assert result["has_validation_errors"] is False, f"False validation error flag on {case['id']}"
        assert len(result["citations"]) > 0
    else:
        # Ground-truth negative: Must NOT be accepted as GROUNDED
        assert result["status"] != "GROUNDED", f"False Acceptance on {case['id']}: expected rejection, but got GROUNDED"
        assert result["has_validation_errors"] is True, f"Missing validation error flag on {case['id']}"


def test_frozen_evaluation_confusion_matrix_and_metrics():
    """
    Run the entire frozen evaluation set, aggregate results, and assert zero false
    acceptances and zero false rejections across all categories.
    """
    total = len(FROZEN_EVALUATION_CASES)
    false_acceptances = 0
    false_rejections = 0
    true_positives = 0
    true_negatives = 0

    for case in FROZEN_EVALUATION_CASES:
        passages = [{
            "span_id": f"span_{case['id']}",
            "source_id": f"src_{case['id']}",
            "version_id": f"ver_{case['id']}",
            "text": case["source"],
        }]

        def make_gen(ans, src, cid):
            return lambda *args: {
                "answer": ans,
                "status": "GROUNDED",
                "citations": [{
                    "span_id": f"span_{cid}",
                    "source_id": f"src_{cid}",
                    "version_id": f"ver_{cid}",
                    "quote": src,
                }],
                "has_validation_errors": False,
            }

        flow = build_qa_flow(lambda q: {"passages": passages}, make_gen(case["answer"], case["source"], case["id"]))
        out = flow.invoke({"question": case["id"]})["output"]

        is_accepted = (out["status"] == "GROUNDED" and out["has_validation_errors"] is False)

        if case["expected_supported"]:
            if is_accepted:
                true_positives += 1
            else:
                false_rejections += 1
        else:
            if is_accepted:
                false_acceptances += 1
            else:
                true_negatives += 1

    far = false_acceptances / (false_acceptances + true_negatives) if (false_acceptances + true_negatives) > 0 else 0.0
    frr = false_rejections / (false_rejections + true_positives) if (false_rejections + true_positives) > 0 else 0.0

    print(f"\n=== FROZEN GROUNDING BENCHMARK RESULTS ===")
    print(f"Total Cases:         {total}")
    print(f"True Positives:      {true_positives}")
    print(f"True Negatives:      {true_negatives}")
    print(f"False Acceptances:   {false_acceptances} (FAR: {far:.2%})")
    print(f"False Rejections:    {false_rejections} (FRR: {frr:.2%})")
    print(f"Overall Accuracy:    {(true_positives + true_negatives) / total:.2%}")

    assert false_acceptances == 0, f"Detected {false_acceptances} false acceptances (FAR: {far:.2%})"
    assert false_rejections == 0, f"Detected {false_rejections} false rejections (FRR: {frr:.2%})"
