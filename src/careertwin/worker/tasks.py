from uuid import UUID

from careertwin.worker.celery_app import celery


@celery.task(
    bind=True,
    autoretry_for=(TimeoutError, ConnectionError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def execute_stage(self: object, run_id: str, stage: str, expected_version: int) -> dict[str, object]:
    """Queue contract only; stage implementations load records by ID and commit immutable artifacts."""

    parsed_run_id = UUID(run_id)
    # The next slice connects this task to PostgresRunStore and the stage registry.
    return {
        "run_id": str(parsed_run_id),
        "stage": stage,
        "expected_version": expected_version,
        "status": "accepted",
    }

