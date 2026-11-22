"""Explicit provider construction; no hidden cloud credentials or model downloads."""
from .core import Fault

def configured_graphiti(driver,llm,embedder,reranker):
    if any(x is None for x in (driver,llm,embedder,reranker)):
        raise Fault(503,'GRAPH_PROVIDERS_UNCONFIGURED')
    from graphiti_core import Graphiti
    return Graphiti(graph_driver=driver,llm_client=llm,embedder=embedder,
        cross_encoder=reranker,store_raw_episode_content=False,max_coroutines=2)

class LocalBGEEmbedder:
    """Local CPU embedding provider for BAAI/bge-small-en-v1.5 (384 dimensions).

    Uses the validated SentenceTransformers + HuggingFace tokenizers reference backend.
    Validates model directory, complete artifact file set (config.json, tokenizer files,
    modules.json, and model.safetensors/pytorch_model.bin), and approved checksums.
    Fails closed when SentenceTransformers or required local artifacts are unavailable.
    """
    REQUIRED_JSON_FILES = ("config.json", "modules.json", "tokenizer_config.json", "special_tokens_map.json")
    TOKENIZER_FILES = ("tokenizer.json", "vocab.txt")
    WEIGHT_FILES = ("model.safetensors", "pytorch_model.bin")
    SUPPORTED_LANGUAGE_SCOPE = (
        "en (English-primary BAAI/bge-small-en-v1.5; non-Latin tokenization preserved, "
        "multilingual retrieval quality not claimed)"
    )

    def __init__(self, weights_path):
        import hashlib
        import json
        import os
        from importlib.metadata import version as pkg_version, PackageNotFoundError
        from pathlib import Path
        if not weights_path:
            raise Fault(503, 'LOCAL_EMBEDDING_WEIGHTS_REQUIRED')
        path = Path(weights_path)
        if not path.is_dir():
            raise Fault(503, 'INVALID_EMBEDDING_ARTIFACT_DIRECTORY')
        config_path = path / "config.json"
        if not config_path.exists():
            raise Fault(503, 'INVALID_EMBEDDING_ARTIFACT_STRUCTURE')

        try:
            config_bytes = config_path.read_bytes()
            config_data = json.loads(config_bytes)
            if not isinstance(config_data, dict):
                raise ValueError("config.json must be an object")
        except Exception:
            raise Fault(503, 'MALFORMED_EMBEDDING_CONFIG')

        config_sha256 = hashlib.sha256(config_bytes).hexdigest()
        expected_config_sha = os.environ.get("WORKBYLINE_EMBEDDING_CONFIG_SHA256", "").strip()
        if expected_config_sha and config_sha256 != expected_config_sha:
            raise Fault(503, 'EMBEDDING_ARTIFACT_CHECKSUM_MISMATCH')

        # Validate complete artifact set: JSON metadata, tokenizer files, and weights
        missing_files = [f for f in self.REQUIRED_JSON_FILES if not (path / f).is_file()]
        has_tokenizer = any((path / f).is_file() for f in self.TOKENIZER_FILES)
        has_weights = any((path / f).is_file() for f in self.WEIGHT_FILES)
        if missing_files or not has_tokenizer or not has_weights:
            raise Fault(503, 'INCOMPLETE_EMBEDDING_ARTIFACT_FILES')

        file_hashes = {}
        tracked_names = list(self.REQUIRED_JSON_FILES)
        for tf in self.TOKENIZER_FILES:
            if (path / tf).is_file():
                tracked_names.append(tf)
        for wf in self.WEIGHT_FILES:
            if (path / wf).is_file():
                tracked_names.append(wf)
        if (path / "1_Pooling" / "config.json").is_file():
            tracked_names.append("1_Pooling/config.json")

        composite_hasher = hashlib.sha256()
        for fname in sorted(set(tracked_names)):
            fpath = path / fname
            h = hashlib.sha256()
            with fpath.open("rb") as fp:
                while chunk := fp.read(1024 * 1024):
                    h.update(chunk)
            digest = h.hexdigest()
            file_hashes[fname] = digest
            composite_hasher.update(f"{fname}:{digest}\n".encode("utf-8"))

        self.file_hashes = file_hashes
        self.config_sha256 = config_sha256
        self.artifact_sha256 = composite_hasher.hexdigest()

        expected_artifact_sha = os.environ.get("WORKBYLINE_EMBEDDING_ARTIFACT_SHA256", "").strip()
        if expected_artifact_sha and self.artifact_sha256 != expected_artifact_sha:
            raise Fault(503, 'EMBEDDING_ARTIFACT_CHECKSUM_MISMATCH')

        self.model_id = "bge-small-en-v1.5"
        self.model_revision = os.environ.get("WORKBYLINE_EMBEDDING_REVISION", "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a").strip() or "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"
        self.dimensions = 384
        self.supported_language_scope = self.SUPPORTED_LANGUAGE_SCOPE

        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise Fault(503, 'SENTENCE_TRANSFORMERS_BACKEND_UNAVAILABLE') from None

        try:
            self.model = SentenceTransformer(str(weights_path), local_files_only=True, device='cpu')
        except Exception as exc:
            raise Fault(503, f'EMBEDDING_MODEL_LOAD_FAILED:{type(exc).__name__}') from None

        def _ver(pkg_name: str) -> str:
            try:
                return pkg_version(pkg_name)
            except PackageNotFoundError:
                return "unknown"

        self.backend = "sentence_transformers"
        self.inference_backend = (
            f"sentence_transformers:{_ver('sentence-transformers')}/"
            f"torch:{_ver('torch')}/"
            f"transformers:{_ver('transformers')}/"
            f"tokenizers:{_ver('tokenizers')}"
        )

        dim_fn = getattr(self.model, "get_embedding_dimension", None) or getattr(self.model, "get_sentence_embedding_dimension")
        if dim_fn() != self.dimensions:
            raise Fault(503, 'EMBEDDING_DIMENSION_MISMATCH')

    def __call__(self, text):
        return self.model.encode(text, normalize_embeddings=True).tolist()


def graphiti_from_env():
    import os
    import ipaddress
    from urllib.parse import urlparse
    # Local experimental graph only; remote TLS/credential management is a later gate.
    required=('WORKBYLINE_GRAPH_URI','WORKBYLINE_GRAPH_USER','WORKBYLINE_GRAPH_PASSWORD',
              'GEMINI_API_KEY','WORKBYLINE_GRAPH_LLM_MODEL','WORKBYLINE_GRAPH_EMBEDDING_MODEL')
    cfg={k:os.environ.get(k,'').strip() for k in required}
    if not all(cfg.values()):
        raise Fault(503,'GRAPH_CONFIG_MISSING')
    uri=urlparse(cfg['WORKBYLINE_GRAPH_URI'])
    if uri.scheme not in ('bolt','neo4j') or uri.hostname not in ('localhost','127.0.0.1'):
        raise Fault(503,'LOCAL_GRAPH_ONLY')
    if os.environ.get('GRAPHITI_TELEMETRY_ENABLED')!='false':
        raise Fault(503,'GRAPH_TELEMETRY_MUST_BE_DISABLED')
    from graphiti_core.driver.neo4j_driver import Neo4jDriver
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.llm_client.gemini_client import GeminiClient
    from graphiti_core.embedder.gemini import GeminiEmbedder,GeminiEmbedderConfig
    from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
    driver=Neo4jDriver(cfg['WORKBYLINE_GRAPH_URI'],cfg['WORKBYLINE_GRAPH_USER'],cfg['WORKBYLINE_GRAPH_PASSWORD'])
    llm_config=LLMConfig(api_key=cfg['GEMINI_API_KEY'],model=cfg['WORKBYLINE_GRAPH_LLM_MODEL'],
        small_model=cfg['WORKBYLINE_GRAPH_LLM_MODEL'],max_tokens=2048)
    return configured_graphiti(driver,GeminiClient(llm_config),
        GeminiEmbedder(GeminiEmbedderConfig(api_key=cfg['GEMINI_API_KEY'],
            embedding_model=cfg['WORKBYLINE_GRAPH_EMBEDDING_MODEL'],embedding_dim=1024)),
        GeminiRerankerClient(llm_config))


class GeminiProviderAdapter:
    """Production provider adapter for Gemini generation with bounded timeout, token budget, and sanitized errors."""
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash", timeout: float = 15.0, max_tokens: int = 1024):
        if not api_key or not api_key.strip():
            raise Fault(503, "LIVE_GENERATION_UNAVAILABLE")
        self.api_key = api_key.strip()
        self.model = model
        self.timeout = float(timeout)
        self.max_tokens = max_tokens

    def __call__(self, question: str, passages: list[dict]) -> dict:
        import json
        try:
            from google.genai import Client
            from google.genai import types
        except ImportError:
            raise Fault(503, "GENAI_SDK_NOT_INSTALLED") from None

        prompt = (
            "You are a strict, evidence-bound research assistant. Answer the question using ONLY the provided passages.\n"
            "Respond in JSON format with exactly these fields:\n"
            "- 'answer': string answer derived directly from evidence, or 'Insufficient source evidence.'\n"
            "- 'status': 'GROUNDED' if supported, 'INSUFFICIENT_EVIDENCE' if evidence does not answer the question\n"
            "- 'citations': list of objects, each containing: span_id, source_id, version_id, quote\n"
            "- 'has_validation_errors': false\n\n"
            f"Question: {question}\n\n"
            f"Passages:\n{json.dumps(passages, indent=2)}"
        )
        try:
            # Enforce request deadline via SDK HttpOptions
            client = Client(
                api_key=self.api_key,
                http_options=types.HttpOptions(timeout=int(self.timeout * 1000))
            )
            config = types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=self.max_tokens,
                response_mime_type="application/json",
            )
            response = client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=config,
            )
            raw_text = response.text or ""
            data = json.loads(raw_text)

            # Strict validation: reject missing or malformed required fields; NEVER default to GROUNDED
            if not isinstance(data, dict):
                return {
                    "answer": "Insufficient source evidence; malformed model response.",
                    "status": "INSUFFICIENT_EVIDENCE",
                    "citations": [],
                    "has_validation_errors": True,
                }

            has_required = (
                isinstance(data.get("answer"), str) and data["answer"].strip() and
                isinstance(data.get("status"), str) and data["status"] in ("GROUNDED", "AMBIGUOUS", "DISAGREEMENT", "INSUFFICIENT_EVIDENCE") and
                isinstance(data.get("citations"), list)
            )
            if not has_required:
                return {
                    "answer": "Insufficient source evidence; model response missing required schema fields.",
                    "status": "INSUFFICIENT_EVIDENCE",
                    "citations": [],
                    "has_validation_errors": True,
                }

            data.setdefault("has_validation_errors", False)
            return data
        except Fault:
            raise
        except Exception as exc:
            # Check for timeout indication
            if "timeout" in str(exc).lower() or "deadline" in str(exc).lower():
                raise Fault(504, "GENERATION_REQUEST_TIMEOUT") from None
            # Sanitized failure: never leak raw provider errors, keys, or endpoints
            raise Fault(503, "LIVE_GENERATION_FAILED") from None


def generator_from_env() -> GeminiProviderAdapter | None:
    """Construct real server-side generator adapter if securely provisioned in environment."""
    import os
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.environ.get("WORKBYLINE_GENERATION_MODEL", "gemini-2.5-flash").strip()
    return GeminiProviderAdapter(api_key, model=model)

