from celery import Celery

from careertwin.config import get_settings

settings = get_settings()

celery = Celery("careertwin", broker=settings.redis_url, backend=settings.redis_url)
celery.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_routes={"careertwin.worker.tasks.*": {"queue": "evidence"}},
)
celery.autodiscover_tasks(["careertwin.worker"])

