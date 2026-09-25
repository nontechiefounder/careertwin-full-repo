FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml README.md ./
COPY src ./src
COPY packages ./packages
RUN uv sync --no-dev --extra ai --extra gemini --extra observability

USER nobody
CMD ["uv", "run", "celery", "-A", "careertwin.worker.celery_app:celery", "worker", "--loglevel=INFO", "--queues=evidence", "--concurrency=2"]
