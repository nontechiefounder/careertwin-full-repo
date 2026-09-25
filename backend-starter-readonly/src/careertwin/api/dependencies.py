from collections.abc import AsyncIterator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from careertwin.ai.gemini import GeminiStructuredClient
from careertwin.api.auth import AuthContext, get_auth_context
from careertwin.config import get_settings
from careertwin.ingestion.scanner import MalwareScanner, StubMalwareScanner
from careertwin.ingestion.storage import InMemoryObjectStorage, ObjectStorageService
from careertwin.orchestration.pipeline import InMemoryRunStore, RunOrchestrator
from careertwin.orchestration.ports import RunStore
from careertwin.persistence.repositories import (
    InMemoryDocumentRepository,
    InMemoryRoleRepository,
    PostgresDocumentRepository,
    PostgresRoleRepository,
    PostgresRunStore,
)
from careertwin.persistence.session import tenant_session

# Global singletons for in-memory testing fallbacks
_in_memory_roles = InMemoryRoleRepository()
_in_memory_docs = InMemoryDocumentRepository()
_in_memory_runs = InMemoryRunStore()
_storage = InMemoryObjectStorage()
_scanner = StubMalwareScanner()


async def get_db_session(
    auth: AuthContext = Depends(get_auth_context),
) -> AsyncIterator[AsyncSession | None]:
    try:
        async for session in tenant_session(auth.org_id):
            yield session
    except (ValueError, Exception):
        yield None


def get_role_repository(
    session: AsyncSession | None = Depends(get_db_session),
) -> PostgresRoleRepository:
    if session is None:
        return _in_memory_roles  # type: ignore[return-value]
    return PostgresRoleRepository(session)


def get_document_repository(
    session: AsyncSession | None = Depends(get_db_session),
) -> PostgresDocumentRepository:
    if session is None:
        return _in_memory_docs  # type: ignore[return-value]
    return PostgresDocumentRepository(session)


def get_run_store(
    session: AsyncSession | None = Depends(get_db_session),
) -> RunStore:
    if session is None:
        return _in_memory_runs
    return PostgresRunStore(session)


def get_orchestrator(
    store: RunStore = Depends(get_run_store),
) -> RunOrchestrator:
    return RunOrchestrator(store=store)


def get_gemini_client() -> GeminiStructuredClient:
    return GeminiStructuredClient(get_settings())


def get_object_storage() -> ObjectStorageService:
    return _storage


def get_malware_scanner() -> MalwareScanner:
    return _scanner
