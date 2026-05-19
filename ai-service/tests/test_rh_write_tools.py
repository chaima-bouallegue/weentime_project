from __future__ import annotations

import asyncio
from typing import Any

from app.tools.executor import ToolExecutor
from app.tools.organisation_structure_tools import register_organisation_structure_tools
from app.tools.registry import ToolRegistry
from app.tools.result import ToolResult
from chatbot_test_helpers import ChatbotFakeBackend, make_context, send_chatbot_message


def test_create_team_asks_missing_department_if_absent() -> None:
    response, state = asyncio.run(
        send_chatbot_message(
            "aamel equipe frontend",
            role="RH",
            current_page="/app/rh/structure/equipes",
        )
    )

    assert response.type == "ask"
    assert response.intent == "rh.structure.team.create"
    assert "departement" in response.text.lower()
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_create_team_confirmation_when_department_present() -> None:
    response, state = asyncio.run(
        send_chatbot_message(
            "aamel equipe frontend departement 3",
            role="RH",
            current_page="/app/rh/structure/equipes",
        )
    )

    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.toolCalls[0].name == "rh.structure.team.create"
    assert response.toolCalls[0].arguments["departement_id"] == 3
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_schedule_list_still_uses_read_tool() -> None:
    response, state = asyncio.run(send_chatbot_message("warini horaires", role="RH", current_page="/app/rh/horaires"))

    assert response.intent == "rh.schedule.list"
    assert response.toolCalls[0].name == "schedule.list"
    assert any(call[0] == "GET" and call[1] == "/horaires" for call in state.copilot_backend_client.calls)


def test_schedule_create_confirmation() -> None:
    response, state = asyncio.run(send_chatbot_message("aamel horaire 35h", role="RH", current_page="/app/rh/horaires"))

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "rh.schedule.create"
    assert response.toolCalls[0].arguments["heures_hebdo"] == 35.0
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_schedule_assign_confirmation() -> None:
    response, state = asyncio.run(
        send_chatbot_message("affecti horaire 7 employe 22", role="RH", current_page="/app/rh/horaires")
    )

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "rh.schedule.assign"
    assert response.toolCalls[0].arguments == {"horaire_id": 7, "cible_type": "UTILISATEUR", "cible_id": 22}
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_department_delete_confirmation() -> None:
    response, state = asyncio.run(
        send_chatbot_message(
            "fasakh departement 12",
            role="RH",
            current_page="/app/rh/structure/departments",
        )
    )

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "rh.structure.department.delete"
    assert response.toolCalls[0].arguments == {"department_id": 12}
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_document_generate_confirmation_uses_existing_tool() -> None:
    response, state = asyncio.run(
        send_chatbot_message("Genere attestation pour Amin Ben Ali", role="RH", current_page="/app/rh/documents")
    )

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "rh.document.generate"
    assert response.toolCalls[0].arguments["type"] == "ATTESTATION_TRAVAIL"
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_employee_assign_team_confirmation_when_ids_present() -> None:
    response, state = asyncio.run(
        send_chatbot_message(
            "affecte employe 22 equipe 8",
            role="RH",
            current_page="/app/rh/structure/equipes",
        )
    )

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "rh.structure.employee.assign_team"
    assert response.toolCalls[0].arguments["user_id"] == 22
    assert response.toolCalls[0].arguments["team_id"] == 8
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_manager_assign_team_confirmation_when_ids_present() -> None:
    response, state = asyncio.run(
        send_chatbot_message(
            "affecte manager 31 equipe 8",
            role="RH",
            current_page="/app/rh/structure/managers",
        )
    )

    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "rh.structure.manager.assign_team"
    assert response.toolCalls[0].arguments["manager_id"] == 31
    assert response.toolCalls[0].arguments["team_id"] == 8
    assert not any(call[0] in {"POST", "PATCH", "PUT", "DELETE"} for call in state.copilot_backend_client.calls)


def test_backend_error_returns_clean_failure_without_fake_success() -> None:
    class FailingBackend(ChatbotFakeBackend):
        async def request(
            self,
            method: str,
            path: str,
            *,
            context,
            params: dict[str, Any] | None = None,
            json: dict[str, Any] | None = None,
            headers=None,
        ) -> ToolResult:
            self.calls.append((method.upper(), path, json))
            return ToolResult.fail("backend_down", "backend exploded", status_code=503)

    registry = ToolRegistry()
    backend = FailingBackend()
    register_organisation_structure_tools(registry, backend)
    executor = ToolExecutor(registry)
    context = make_context("RH")

    result = asyncio.run(
        executor.execute(
            "rh.structure.department.delete",
            {"department_id": 12},
            context,
            confirmed=True,
            idempotency_key="test-delete-dept-12",
        )
    )

    dumped = result.model_dump(mode="json")
    assert result.success is False
    assert dumped["data"]["write_result"]["kind"] == "write_result"
    assert "Action approved" not in str(dumped)
    assert "approuvee" not in str(dumped).lower()
