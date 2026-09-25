from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from careertwin.domain.enums import WorkflowStatus
from careertwin.domain.models import Document, Role, WorkflowRun
from careertwin.orchestration.pipeline import ConcurrencyConflict
from careertwin.orchestration.ports import RunStore
from careertwin.persistence.models import DocumentRecord, RoleRecord, WorkflowRunRecord


class PostgresRoleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, role: Role) -> Role:
        record = RoleRecord(
            id=role.id,
            org_id=role.org_id,
            title=role.title,
            description=role.description,
            created_at=role.created_at,
        )
        self.session.add(record)
        await self.session.flush()
        return role

    async def get(self, role_id: UUID) -> Role | None:
        stmt = select(RoleRecord).where(RoleRecord.id == role_id)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()
        if record is None:
            return None
        return Role(
            id=record.id,
            org_id=record.org_id,
            title=record.title,
            description=record.description,
            created_at=record.created_at,
        )


class InMemoryRoleRepository:
    def __init__(self) -> None:
        self.roles: dict[UUID, Role] = {}

    async def create(self, role: Role) -> Role:
        self.roles[role.id] = role
        return role

    async def get(self, role_id: UUID) -> Role | None:
        return self.roles.get(role_id)


class PostgresRunStore(RunStore):
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, run_id: UUID) -> WorkflowRun | None:
        stmt = select(WorkflowRunRecord).where(WorkflowRunRecord.id == run_id)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()
        if record is None:
            return None
        return WorkflowRun(
            id=record.id,
            org_id=record.org_id,
            role_id=record.role_id,
            candidate_ids=tuple(record.candidate_ids),
            status=WorkflowStatus(record.status),
            version=record.version,
            rubric_version=record.rubric_version,
            ontology_version=record.ontology_version,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    async def create(self, run: WorkflowRun) -> WorkflowRun:
        existing = await self.get(run.id)
        if existing is not None:
            return existing
        record = WorkflowRunRecord(
            id=run.id,
            org_id=run.org_id,
            role_id=run.role_id,
            candidate_ids=list(run.candidate_ids),
            status=run.status.value if isinstance(run.status, WorkflowStatus) else str(run.status),
            version=run.version,
            rubric_version=run.rubric_version,
            ontology_version=run.ontology_version,
            created_at=run.created_at,
            updated_at=run.updated_at,
        )
        self.session.add(record)
        await self.session.flush()
        return run

    async def compare_and_set(self, run: WorkflowRun, expected_version: int) -> WorkflowRun:
        stmt = select(WorkflowRunRecord).where(WorkflowRunRecord.id == run.id)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()
        if record is None:
            raise KeyError(run.id)
        if record.version != expected_version:
            raise ConcurrencyConflict(
                f"run {run.id} expected version {expected_version}, found {record.version}"
            )
        record.status = run.status.value if isinstance(run.status, WorkflowStatus) else str(run.status)
        record.version = run.version
        record.updated_at = run.updated_at
        await self.session.flush()
        return run


class PostgresDocumentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, doc: Document) -> Document:
        record = DocumentRecord(
            id=doc.id,
            org_id=doc.org_id,
            candidate_id=doc.candidate_id,
            object_key=doc.object_key,
            original_filename=doc.original_filename,
            media_type=doc.media_type,
            sha256=doc.sha256,
            scan_status=doc.scan_status,
            parser_version=doc.parser_version,
            created_at=doc.created_at,
        )
        self.session.add(record)
        await self.session.flush()
        return doc

    async def get(self, doc_id: UUID) -> Document | None:
        stmt = select(DocumentRecord).where(DocumentRecord.id == doc_id)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()
        if record is None:
            return None
        return Document(
            id=record.id,
            org_id=record.org_id,
            candidate_id=record.candidate_id,
            object_key=record.object_key,
            original_filename=record.original_filename,
            media_type=record.media_type,
            sha256=record.sha256,
            scan_status=record.scan_status,
            parser_version=record.parser_version,
            created_at=record.created_at,
        )

    async def update_scan_status(self, doc_id: UUID, status: str) -> Document:
        stmt = select(DocumentRecord).where(DocumentRecord.id == doc_id)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()
        if record is None:
            raise KeyError(doc_id)
        record.scan_status = status
        await self.session.flush()
        return Document(
            id=record.id,
            org_id=record.org_id,
            candidate_id=record.candidate_id,
            object_key=record.object_key,
            original_filename=record.original_filename,
            media_type=record.media_type,
            sha256=record.sha256,
            scan_status=record.scan_status,
            parser_version=record.parser_version,
            created_at=record.created_at,
        )


class InMemoryDocumentRepository:
    def __init__(self) -> None:
        self.docs: dict[UUID, Document] = {}

    async def create(self, doc: Document) -> Document:
        self.docs[doc.id] = doc
        return doc

    async def get(self, doc_id: UUID) -> Document | None:
        return self.docs.get(doc_id)

    async def update_scan_status(self, doc_id: UUID, status: str) -> Document:
        doc = self.docs.get(doc_id)
        if doc is None:
            raise KeyError(doc_id)
        updated = doc.model_copy(update={"scan_status": status})
        self.docs[doc_id] = updated
        return updated
