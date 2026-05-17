from __future__ import annotations

import asyncio

import pytest

from chatbot_test_helpers import send_chatbot_message


@pytest.mark.parametrize(
    ("message", "language"),
    [
        ("System health", "en"),
        ("Etat backend", "fr"),
        ("حالة النظام", "ar"),
        ("chnowa sante systeme", "tn"),
    ],
)
def test_admin_system_health_routes_to_admin_diagnostics_multilingual(message: str, language: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="ADMIN", language=language))
    assert response.intent == "admin.system_health"
    assert any(call.name == "admin.system_health" for call in response.toolCalls)
    assert not response.intent.startswith("fallback.")


@pytest.mark.parametrize(
    ("message", "expected_intent", "expected_tool"),
    [
        ("AI provider status", "admin.provider_status", "admin.provider_status"),
        ("Ollama status", "admin.provider_status", "admin.provider_status"),
        ("Redis status", "admin.redis_status", "admin.redis_status"),
        ("Braintrust status", "admin.braintrust_status", "admin.braintrust_status"),
        ("Chroma status", "admin.rag_status", "admin.rag_status"),
    ],
)
def test_admin_infrastructure_status_prompts_are_safe_reads(message: str, expected_intent: str, expected_tool: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="ADMIN"))
    assert response.intent == expected_intent
    assert any(call.name == expected_tool for call in response.toolCalls)
    assert response.requiresConfirmation is False


def test_admin_tenant_configuration_issues_use_misconfiguration_read() -> None:
    response, _ = asyncio.run(send_chatbot_message("Tenant configuration issues", role="ADMIN", language="en"))
    assert response.intent == "admin.tenant_issues"
    assert any(call.name == "admin.misconfigured_users" for call in response.toolCalls)


@pytest.mark.parametrize(
    ("message", "expected_intent", "expected_tool"),
    [
        ("lister utilisateurs", "admin.list_users", "admin.list_users"),
        ("lister entreprises", "admin.list_enterprises", "admin.list_enterprises"),
    ],
)
def test_admin_list_users_and_enterprises_use_read_tools(message: str, expected_intent: str, expected_tool: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="ADMIN"))
    assert response.intent == expected_intent
    assert any(call.name == expected_tool for call in response.toolCalls)


def test_admin_create_user_requires_missing_fields_or_confirmation() -> None:
    response, _ = asyncio.run(send_chatbot_message("Create user", role="ADMIN"))
    assert response.type in {"ask", "confirm_action"}
    assert not response.intent.startswith("fallback.")


def test_admin_complete_create_user_requires_confirmation() -> None:
    response, _ = asyncio.run(
        send_chatbot_message(
            "creer utilisateur Ahmed Ben email ahmed@ween.tn password Password123 role RH entreprise 1",
            role="ADMIN",
        )
    )
    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert response.intent == "admin.create_user"
    assert any(call.name == "admin.create_user" for call in response.toolCalls)


@pytest.mark.parametrize(
    ("message", "expected_tool"),
    [
        ("changer role utilisateur 30 vers RH", "admin.update_user_role"),
        ("assigner manager 7 utilisateur 30", "admin.assign_manager"),
        ("Affecte RH 4 a entreprise 2", "admin.assign_rh_owner"),
    ],
)
def test_admin_assignment_and_role_mutations_require_confirmation(message: str, expected_tool: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="ADMIN"))
    assert response.type == "confirm_action"
    assert response.requiresConfirmation is True
    assert any(call.name == expected_tool for call in response.toolCalls)


@pytest.mark.parametrize(
    ("message", "capability"),
    [
        ("restart service ai", "admin.service_control"),
        ("DB backup now", "admin.database_operations"),
        ("Passe sur Anthropic", "admin.ai_config_mutation"),
        ("reconstruire index RAG", "admin.rag_mutation"),
        ("Créer entreprise Poulina", "admin.enterprise_creation"),
    ],
)
def test_admin_unsupported_operations_return_capability_unavailable(message: str, capability: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="ADMIN"))
    assert response.actionResult is not None
    assert response.actionResult["kind"] == "capability_unavailable"
    assert response.actionResult["capability"] == capability
    assert response.intent == f"{capability}.unavailable"
    assert not response.intent.startswith("fallback.")


def test_admin_diagnostics_do_not_expose_secrets() -> None:
    response, _ = asyncio.run(send_chatbot_message("Redis status", role="ADMIN"))
    rendered = f"{response.text} {response.actionResult}"
    assert "redis://" not in rendered
    assert "Authorization:" not in rendered
    assert "Bearer " not in rendered
    assert "api_key" not in rendered.lower()
