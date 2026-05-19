from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest

from app.context.current_user import CurrentUserContext
from app.core.conversation_state import ConversationStateStore
from app.guards.response_guard import ResponseGuard
from app.memory.confirmation_store import ConfirmationStore
from app.tools.attendance_tools import register_attendance_tools
from app.tools.backend_client import BackendClient
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from app.workflows.workflow_orchestrator import WorkflowOrchestrator


def verified_context() -> CurrentUserContext:
    return CurrentUserContext(
        user_id=12,
        role="RH",
        entreprise_id=9,
        permissions={"attendance:read:self", "attendance:write:self"},
        token="token",
        language="fr",
        metadata={"jwt_verified": True},
    )


class FakeContextBuilder:
    def __init__(self, context: CurrentUserContext) -> None:
        self.context = context

    async def build(self, authorization, *, payload_user_id=None, locale="fr-FR", language="fr"):
        _ = authorization, payload_user_id
        self.context.locale = locale
        self.context.language = language
        return self.context

    def _from_claims(self, claims, *, token, locale, language):  # pragma: no cover - compatibility only
        _ = claims, token
        self.context.locale = locale
        self.context.language = language
        return self.context


class DisabledProviderRouter:
    mode = "disabled"
    default_model = None

    async def generate_agent_response(self, request, *, context=None, response_guard=None):  # pragma: no cover - not used
        raise AssertionError("provider fallback should not be called")


class AcceptedAttendanceBackend:
    async def get(self, path, *, context, params=None):
        _ = context, params
        if path == "/presence/me/today":
            return ToolResult.ok({"status": "ABSENT", "state": "NOT_STARTED"}, status_code=200)
        return ToolResult.ok({}, status_code=200)

    async def post(self, path, *, context, json=None, headers=None):
        _ = path, context, json, headers
        return ToolResult.ok({"queued": True}, status_code=202)


def attendance_executor(backend: object) -> ToolExecutor:
    registry = ToolRegistry()
    register_attendance_tools(registry, backend)  # type: ignore[arg-type]
    return ToolExecutor(registry)


def confirmation_orchestrator(result: ToolResult) -> tuple[WorkflowOrchestrator, CurrentUserContext, str]:
    context = verified_context()
    store = ConfirmationStore()
    record = store.create(context, "check_in", {})
    executor = type("Executor", (), {"execute": AsyncMock(return_value=result)})()
    orchestrator = WorkflowOrchestrator(
        context_builder=FakeContextBuilder(context),
        router_agent=object(),
        confirmation_store=store,
        executor=executor,
        conversation_store=ConversationStateStore(),
        response_guard=ResponseGuard(),
        provider_router=DisabledProviderRouter(),
    )
    return orchestrator, context, record.confirmation_id


@pytest.mark.asyncio
async def test_backend_client_timeout_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _timeout(self, method, url, **kwargs):
        _ = self, kwargs
        raise httpx.ReadTimeout("timed out", request=httpx.Request(method, url))

    monkeypatch.setattr(httpx.AsyncClient, "request", _timeout)

    result = await BackendClient(base_url="http://localhost:8322/api/v1").post(
        "/presence/me/check-in",
        context=verified_context(),
        json={"source": "AI_CHATBOT"},
        tool_name="attendance.check_in",
        success_status_codes={200, 201},
    )

    assert result.success is False
    assert result.error_code == "backend_unavailable"
    assert result.status_code == 503


@pytest.mark.asyncio
async def test_backend_client_connection_refused_returns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _refused(self, method, url, **kwargs):
        _ = self, kwargs
        raise httpx.ConnectError("connection refused", request=httpx.Request(method, url))

    monkeypatch.setattr(httpx.AsyncClient, "request", _refused)

    result = await BackendClient(base_url="http://localhost:8322/api/v1").post(
        "/presence/me/check-in",
        context=verified_context(),
        json={"source": "AI_CHATBOT"},
        tool_name="attendance.check_in",
        success_status_codes={200, 201},
    )

    assert result.success is False
    assert result.error_code == "backend_unavailable"
    assert result.status_code == 503


@pytest.mark.asyncio
async def test_attendance_check_in_rejects_unexpected_accepted_status() -> None:
    result = await attendance_executor(AcceptedAttendanceBackend()).execute(
        "check_in",
        {},
        verified_context(),
        confirmed=True,
    )

    assert result.success is False
    assert result.error_code == "backend_error"
    assert result.status_code == 202


@pytest.mark.parametrize(
    ("failure", "expected_text"),
    [
        (ToolResult.fail("backend_unavailable", "timed out", status_code=503), "Le service de pointage est indisponible actuellement."),
        (ToolResult.fail("http_401", "Unauthorized", status_code=401), "Votre session a expire. Veuillez vous reconnecter."),
        (ToolResult.fail("http_403", "Forbidden", status_code=403), "Vous n'avez pas les droits necessaires pour effectuer cette action."),
        (ToolResult.fail("http_500", "Internal Server Error", status_code=500), "Le service de pointage est indisponible actuellement."),
        (ToolResult.fail("backend_unavailable", "connection refused", status_code=503), "Le service de pointage est indisponible actuellement."),
    ],
    ids=["timeout", "401", "403", "500", "connection-refused"],
)
def test_confirmed_attendance_failure_returns_error_only(
    failure: ToolResult,
    expected_text: str,
) -> None:
    orchestrator, context, confirmation_id = confirmation_orchestrator(failure)

    result = asyncio.run(
        orchestrator.confirm_action(
            approved=True,
            confirmation_id=confirmation_id,
            context=context,
            metadata={"request_id": "req-attendance-failure"},
        )
    )

    assert result.response.type == "error"
    assert result.response.toolCalls[0].status == "failed"
    assert result.response.actionResult["success"] is False
    assert result.response.text == expected_text
    assert result.response.text != "Pointage d'entree confirme."
    assert "approved" not in result.response.text.lower()
