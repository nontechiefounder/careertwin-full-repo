FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml README.md ./
COPY src ./src
RUN uv sync --no-dev --extra gemini --extra observability

USER nobody
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "careertwin.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
