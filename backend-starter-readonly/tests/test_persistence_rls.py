from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from careertwin.domain.enums import WorkflowStatus
from careertwin.domain.models import Role, WorkflowRun
from careertwin.orchestration.pipeline import ConcurrencyConflict
from careertwin.persistence.models import RoleRecord, WorkflowRunRecord
from careertwin.persistence.repositories import PostgresRoleRepository, PostgresRunStore
from careertwin.persistence.session import tenant_session


class TestPersistenceRLS:
    @pytest.mark.asyncio
    async def test_tenant_session_sets_org_context(self) -> None:
        org_id = uuid4()
        session_mock = AsyncMock()
        begin_cm = MagicMock()
        begin_cm.__aenter__ = AsyncMock(return_value=None)
        begin_cm.__aexit__ = AsyncMock(return_value=None)
        session_mock.begin = MagicMock(return_value=begin_cm)

        session_factory_mock = MagicMock()
        factory_cm = MagicMock()
        factory_cm.__aenter__ = AsyncMock(return_value=session_mock)
        factory_cm.__aexit__ = AsyncMock(return_value=None)
        session_factory_mock.return_value = factory_cm

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(
                "careertwin.persistence.session.session_factory",
                session_factory_mock,
            )
            async for _ in tenant_session(org_id):
                pass

        session_mock.execute.assert_called_once()
        call_args = session_mock.execute.call_args
        assert "set_config('app.current_org_id', :org_id, true)" in str(call_args[0][0])
        assert call_args[0][1]["org_id"] == str(org_id)

    @pytest.mark.asyncio
    async def test_role_repository_create_and_get(self) -> None:
        session_mock = AsyncMock()
        repo = PostgresRoleRepository(session_mock)

        org_id = uuid4()
        role = Role(
            org_id=org_id,
            title="Senior Backend Engineer",
            description="Build scalable distributed backend microservices and data pipelines.",
        )

        created = await repo.create(role)
        assert created.id == role.id
        assert created.title == role.title
        session_mock.add.assert_called_once()
        session_mock.flush.assert_called_once()

        # Mock GET returning record
        mock_record = RoleRecord(
            id=role.id,
            org_id=org_id,
            title=role.title,
            description=role.description,
            created_at=role.created_at,
        )
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = mock_record
        session_mock.execute.return_value = result_mock

        fetched = await repo.get(role.id)
        assert fetched is not None
        assert fetched.id == role.id
        assert fetched.title == role.title

    @pytest.mark.asyncio
    async def test_run_store_create_get_and_compare_and_set(self) -> None:
        session_mock = AsyncMock()
        store = PostgresRunStore(session_mock)

        org_id = uuid4()
        role_id = uuid4()
        candidate_id = uuid4()
        run = WorkflowRun(
            org_id=org_id,
            role_id=role_id,
            candidate_ids=(candidate_id,),
            status=WorkflowStatus.CREATED,
            version=0,
        )

        # GET returns None initially
        result_none = MagicMock()
        result_none.scalar_one_or_none.return_value = None
        session_mock.execute.return_value = result_none

        created = await store.create(run)
        assert created.id == run.id
        session_mock.add.assert_called_once()
        session_mock.flush.assert_called_once()

        # Mock GET returning existing record
        mock_record = WorkflowRunRecord(
            id=run.id,
            org_id=org_id,
            role_id=role_id,
            candidate_ids=[candidate_id],
            status="created",
            version=0,
            rubric_version="0.1.0",
            ontology_version="0.1.0",
            created_at=run.created_at,
            updated_at=run.updated_at,
        )
        result_found = MagicMock()
        result_found.scalar_one_or_none.return_value = mock_record
        session_mock.execute.return_value = result_found

        fetched = await store.get(run.id)
        assert fetched is not None
        assert fetched.status == WorkflowStatus.CREATED
        assert fetched.version == 0

        # Test compare_and_set success
        updated_run = run.model_copy(
            update={"status": WorkflowStatus.VALIDATING, "version": 1}
        )
        cas_res = await store.compare_and_set(updated_run, expected_version=0)
        assert cas_res.version == 1
        assert mock_record.status == "validating"

        # Test compare_and_set conflict raising
        mock_record.version = 2
        with pytest.raises(ConcurrencyConflict):
            await store.compare_and_set(updated_run, expected_version=0)
