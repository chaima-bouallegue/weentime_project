from __future__ import annotations

import asyncio

import pytest

from app.tools.result import ToolResult
from chatbot_test_helpers import ChatbotFakeBackend, send_chatbot_message


def test_manager_pending_approvals_use_manager_agent() -> None:
    response, _ = asyncio.run(send_chatbot_message("Pending approvals", role="MANAGER"))
    assert response.intent == "manager.pending_approvals"
    assert response.actionResult["kind"] == "manager_pending_summary"
    assert not response.intent.startswith("fallback.")


def test_manager_can_point_personally() -> None:
    response, _ = asyncio.run(send_chatbot_message("Did I check in?", role="MANAGER"))
    assert response.intent == "attendance.status"
    assert any(call.name == "get_pointage_status" for call in response.toolCalls)


@pytest.mark.parametrize("message", ["Did I check in?", "pointit ou nn", "est ce que jai pointé"])
def test_manager_personal_pointage_stays_personal(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="MANAGER"))
    assert response.intent == "attendance.status"
    assert any(call.name == "get_pointage_status" for call in response.toolCalls)


def test_manager_team_presence_uses_attendance_tool() -> None:
    response, _ = asyncio.run(send_chatbot_message("Pointage equipe", role="MANAGER"))
    assert response.intent == "attendance.team_presence"
    assert response.actionResult["success"] is True


@pytest.mark.parametrize(
    "message",
    ["Pointage équipe", "Qui n’a pas pointé ?", "chkoun ma pointach?", "Team attendance anomalies"],
)
def test_manager_team_pointage_routes_to_team_presence(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="MANAGER"))
    assert response.intent == "attendance.team_presence", message
    assert any(call.name == "get_team_presence" for call in response.toolCalls)


class TeamPresenceUnavailableBackend(ChatbotFakeBackend):
    async def get(self, path, *, context, params=None):
        if path == "/presence/team/today":
            self.calls.append(("GET", path, params))
            return ToolResult.fail("backend_unavailable", "Presence equipe indisponible.", status_code=503)
        return await super().get(path, context=context, params=params)


def test_manager_team_presence_unavailable_is_clean_contract() -> None:
    backend = TeamPresenceUnavailableBackend()
    response, _ = asyncio.run(send_chatbot_message("Pointage équipe", role="MANAGER", backend=backend))
    assert response.intent == "attendance.team_presence"
    assert response.actionResult["error_code"] == "backend_unavailable"
    assert not response.intent.startswith("fallback.")


@pytest.mark.parametrize(
    "message",
    [
        "Pending approvals",
        "Montre demandes en attente",
        "Qui attend validation ?",
        "validations en attente",
        "اعرض الموافقات المعلقة",
        "chnowa demandes en attente",
    ],
)
def test_manager_pending_approvals_multilingual(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="MANAGER"))
    assert response.intent == "manager.pending_approvals", message
    assert response.actionResult["kind"] == "manager_pending_summary"
    assert not response.intent.startswith("fallback.")


def test_manager_approval_creates_confirmation_after_details() -> None:
    response, _ = asyncio.run(send_chatbot_message("Approuve le conge 42", role="MANAGER"))
    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.actionResult["kind"] == "approval_confirmation"


@pytest.mark.parametrize("message", ["Approuve demande 42", "Refuse demande 42", "approve request 42", "reject request 42"])
def test_manager_decisions_create_confirmation_not_execution(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="MANAGER"))
    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.actionResult["kind"] == "approval_confirmation"
    assert response.toolCalls[0].status == "pending_confirmation"


def test_manager_accept_by_employee_name_creates_confirmation_when_resolved() -> None:
    response, _ = asyncio.run(send_chatbot_message("Accepte la demande d’Ahmed", role="MANAGER"))
    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.actionResult["kind"] == "approval_confirmation"
    assert response.toolCalls[0].name == "telework.manager_decide"


def test_manager_unknown_request_id_returns_clarification_not_execution() -> None:
    response, _ = asyncio.run(send_chatbot_message("Approuve demande 12", role="MANAGER"))
    assert response.type == "ask"
    assert response.intent == "manager.approve"
    assert response.actionResult["kind"] == "approval_lookup"
    assert response.actionResult["status"] == "not_found"
    assert not response.toolCalls


class AmbiguousRequestBackend(ChatbotFakeBackend):
    async def get(self, path, *, context, params=None):
        if path == "/rh/conges/manager":
            self.calls.append(("GET", path, params))
            return ToolResult.ok([{"id": 12, "statut": "EN_ATTENTE_MANAGER", "employe": "Essia"}])
        if path == "/rh/teletravail/demandes-equipe":
            self.calls.append(("GET", path, params))
            return ToolResult.ok({"content": [{"id": 12, "statut": "EN_ATTENTE_MANAGER", "employe": "Essia"}]})
        return await super().get(path, context=context, params=params)


def test_manager_ambiguous_request_returns_choices() -> None:
    response, _ = asyncio.run(send_chatbot_message("Approuve demande 12", role="MANAGER", backend=AmbiguousRequestBackend()))
    assert response.type == "ask"
    assert response.actionResult["kind"] == "approval_lookup"
    assert response.actionResult["status"] == "ambiguous"
    assert response.actionResult["choices"]


@pytest.mark.parametrize(
    ("message", "capability"),
    [
        ("Génère rapport équipe", "manager.reports"),
        ("Créer réunion demain", "meeting.create"),
        ("Qui est disponible ?", "manager.availability"),
        ("Assigner mission", "manager.missions"),
        ("Qui travaille sur quoi ?", "manager.missions"),
    ],
)
def test_manager_unsupported_features_return_capability_unavailable(message: str, capability: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="MANAGER"))
    assert response.actionResult["kind"] == "capability_unavailable"
    assert response.actionResult["capability"] == capability
    assert not response.intent.startswith("fallback.")


def test_manager_team_summary_routes_to_role_intelligence_digest() -> None:
    response, _ = asyncio.run(send_chatbot_message("Today’s team summary", role="MANAGER"))
    assert response.intent == "role_intelligence.manager_digest"
    assert response.actionResult["kind"] == "role_intelligence_digest"
