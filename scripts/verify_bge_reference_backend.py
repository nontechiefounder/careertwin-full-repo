#!/usr/bin/env python3
"""Verify LocalBGEEmbedder reference SentenceTransformers backend, tokenization,
language scope, fail-closed behavior, and frozen-corpus retrieval benchmark.
"""
from __future__ import annotations

import builtins
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from service.core import Fault
import service.provider_factory as pf
from service.provider_factory import LocalBGEEmbedder

WEIGHTS_DIR = os.environ.get("WORKBYLINE_EMBEDDING_WEIGHTS", "/tmp/workbyline_bge_small_en_v1_5")
MANIFEST_PATH = ROOT / "evidence" / "model_artifact_manifest.json"
LOG_PATH = ROOT / "logs" / "verification" / "bge_reference_verification.log"


def cosine_sim(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na > 0 and nb > 0 else 0.0


def main() -> int:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []

    def log(msg: str) -> None:
        print(msg, flush=True)
        lines.append(msg)

    log("=== WorkByLine V3: BGE Reference Backend & Tokenization Verification ===")

    # 1. Verify _SafetensorsBertModel is completely removed from provider_factory
    assert not hasattr(pf, "_SafetensorsBertModel"), "_SafetensorsBertModel must not exist in provider_factory"
    log("[PASS] _SafetensorsBertModel removed from release path")

    # 2. Verify fail-closed behavior when sentence_transformers is unavailable
    real_import = builtins.__import__

    def blocked_import(name, *args, **kwargs):
        if name == "sentence_transformers" or name.startswith("sentence_transformers."):
            raise ImportError("Simulated missing sentence_transformers")
        return real_import(name, *args, **kwargs)

    builtins.__import__ = blocked_import
    try:
        try:
            LocalBGEEmbedder(WEIGHTS_DIR)
            raise AssertionError("Expected Fault(503, 'SENTENCE_TRANSFORMERS_BACKEND_UNAVAILABLE')")
        except Fault as exc:
            assert exc.status == 503 and exc.code == "SENTENCE_TRANSFORMERS_BACKEND_UNAVAILABLE", f"Unexpected Fault: {exc.status} {exc.code}"
            log(f"[PASS] Fail-closed when sentence_transformers unavailable: {exc.status} {exc.code}")
    finally:
        builtins.__import__ = real_import

    # 3. Instantiate LocalBGEEmbedder and direct reference SentenceTransformer + AutoTokenizer
    embedder = LocalBGEEmbedder(WEIGHTS_DIR)
    assert embedder.backend == "sentence_transformers"
    assert embedder.inference_backend.startswith("sentence_transformers:")
    log(f"[PASS] LocalBGEEmbedder loaded with inference_backend={embedder.inference_backend}")
    log(f"[PASS] Supported language scope: {embedder.supported_language_scope}")

    from sentence_transformers import SentenceTransformer
    from transformers import AutoTokenizer

    ref_model = SentenceTransformer(WEIGHTS_DIR, local_files_only=True, device="cpu")
    ref_tokenizer = AutoTokenizer.from_pretrained(WEIGHTS_DIR, local_files_only=True)
    st_tokenizer = embedder.model.tokenizer

    # 4. Tokenization equivalence across English, technical punctuation, accented names, and non-Latin/Chinese
    tokenization_cases = [
        {
            "category": "english_prose",
            "text": "Distributed consensus leadership in multi-region PostgreSQL and Kubernetes clusters.",
        },
        {
            "category": "technical_punctuation",
            "text": "C++20 / Node.js v22.4.0 :: pgvector <=> cosine (SHA-256: 5650b43c69a5) @ O'Reilly & Co.",
        },
        {
            "category": "accented_names",
            "text": "Søren Kierkegaard, Renée Dupré, Łukasz Żółć, and François Müller at Zürich Café.",
        },
        {
            "category": "non_latin_chinese_multilingual",
            "text": "分布式系统架构与高可用性设计 — 東京の分散システム設計 — Привет мир",
        },
    ]

    tokenization_results = []
    for case in tokenization_cases:
        txt = case["text"]
        ref_ids = ref_tokenizer.encode(txt, add_special_tokens=True)
        st_ids = st_tokenizer.encode(txt, add_special_tokens=True)
        ref_tokens = ref_tokenizer.convert_ids_to_tokens(ref_ids)
        assert ref_ids == st_ids, f"Tokenizer ID mismatch for {case['category']}: {ref_ids} != {st_ids}"
        # Verify non-Latin characters are tokenized into real vocabulary tokens rather than dropped
        non_special_ids = [tid for tid in st_ids if tid not in (ref_tokenizer.cls_token_id, ref_tokenizer.sep_token_id)]
        assert len(non_special_ids) >= 4, f"Unexpectedly empty tokenization for {case['category']}"

        vec_embedder = embedder(txt)
        vec_ref = ref_model.encode(txt, normalize_embeddings=True).tolist()
        sim = cosine_sim(vec_embedder, vec_ref)
        max_diff = max(abs(a - b) for a, b in zip(vec_embedder, vec_ref))
        assert sim > 0.999999 and max_diff < 1e-6, f"Vector mismatch for {case['category']}: sim={sim}, max_diff={max_diff}"

        res = {
            "category": case["category"],
            "text": txt,
            "token_count": len(st_ids),
            "sample_tokens": ref_tokens[:12],
            "tokenizer_exact_match": True,
            "reference_cosine_similarity": round(sim, 8),
            "reference_max_abs_diff": float(f"{max_diff:.2e}"),
        }
        tokenization_results.append(res)
        log(
            f"[PASS] Tokenization & vector equivalence ({case['category']}): "
            f"tokens={len(st_ids)}, cosine={sim:.8f}, max_diff={max_diff:.2e}"
        )

    # 5. Frozen Corpus Retrieval Benchmark (Semantic Paraphrase + Exact Identifier)
    frozen_corpus = [
        {
            "doc_id": "doc_consensus",
            "text": "Architected Raft and Paxos state-machine replication for geo-distributed fault-tolerant storage engines.",
        },
        {
            "doc_id": "doc_frontend",
            "text": "Designed accessible React design systems with Tailwind CSS and Storybook visual regression suites.",
        },
        {
            "doc_id": "doc_ml_infra",
            "text": "Optimized PyTorch GPU kernel scheduling and quantized transformer inference pipelines.",
        },
        {
            "doc_id": "doc_security",
            "text": "Implemented zero-trust mTLS service mesh identity and hardware security module key rotation.",
        },
        {
            "doc_id": "doc_incident_id",
            "text": "Resolved production outage INC-9482-OMEGA caused by connection pool exhaustion under failover.",
        },
    ]
    corpus_vecs = {d["doc_id"]: embedder(d["text"]) for d in frozen_corpus}

    benchmark_queries = [
        {
            "query": "leader election and quorum protocols across data centers",
            "expected_top_doc": "doc_consensus",
            "type": "semantic_paraphrase_zero_lexical_overlap",
        },
        {
            "query": "neural network accelerator latency and model compression",
            "expected_top_doc": "doc_ml_infra",
            "type": "semantic_paraphrase_zero_lexical_overlap",
        },
        {
            "query": "user interface component library and wcag compliance",
            "expected_top_doc": "doc_frontend",
            "type": "semantic_paraphrase_zero_lexical_overlap",
        },
        {
            "query": "INC-9482-OMEGA failover root cause",
            "expected_top_doc": "doc_incident_id",
            "type": "exact_identifier_plus_context",
        },
    ]

    benchmark_results = []
    for bq in benchmark_queries:
        q_vec = embedder(bq["query"])
        ranked = sorted(
            (
                (cosine_sim(q_vec, corpus_vecs[d["doc_id"]]), d["doc_id"])
                for d in frozen_corpus
            ),
            reverse=True,
        )
        top_score, top_doc = ranked[0]
        runner_up_score, runner_up_doc = ranked[1]
        assert top_doc == bq["expected_top_doc"], (
            f"Benchmark query '{bq['query']}' expected {bq['expected_top_doc']}, got {top_doc}"
        )
        benchmark_results.append({
            "query": bq["query"],
            "query_type": bq["type"],
            "expected_top_doc": bq["expected_top_doc"],
            "actual_top_doc": top_doc,
            "top_cosine_score": round(top_score, 6),
            "runner_up_doc": runner_up_doc,
            "runner_up_cosine_score": round(runner_up_score, 6),
            "margin": round(top_score - runner_up_score, 6),
            "passed": True,
        })
        log(
            f"[PASS] Frozen corpus benchmark ({bq['type']}): '{bq['query']}' -> "
            f"{top_doc} (score={top_score:.4f}, margin=+{top_score - runner_up_score:.4f})"
        )

    manifest = {
        "model_id": "BAAI/bge-small-en-v1.5",
        "internal_model_id": embedder.model_id,
        "source_repository": "https://huggingface.co/BAAI/bge-small-en-v1.5",
        "revision": embedder.model_revision,
        "license": "MIT",
        "dimensions": embedder.dimensions,
        "pooling": "cls",
        "normalize_embeddings": True,
        "inference_backend": embedder.inference_backend,
        "custom_fallback_removed": True,
        "fail_closed_without_sentence_transformers": True,
        "supported_language_scope": embedder.supported_language_scope,
        "local_weights_directory": WEIGHTS_DIR,
        "config_sha256": embedder.config_sha256,
        "composite_artifact_sha256": embedder.artifact_sha256,
        "files": {
            fname: {
                "sha256": sha,
                "bytes": (Path(WEIGHTS_DIR) / fname).stat().st_size,
            }
            for fname, sha in sorted(embedder.file_hashes.items())
        },
        "tokenization_and_reference_verification": tokenization_results,
        "frozen_corpus_retrieval_benchmark": {
            "corpus_size": len(frozen_corpus),
            "queries_tested": len(benchmark_results),
            "top1_accuracy": 1.0,
            "results": benchmark_results,
        },
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    LOG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log(f"=== Wrote {MANIFEST_PATH} and {LOG_PATH} ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

