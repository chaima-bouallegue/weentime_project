from __future__ import annotations

import asyncio

import pytest

from chatbot_test_helpers import send_chatbot_message


@pytest.mark.parametrize(
    "message",
    [
        "RH backlog",
        "Pending validations",
        "validations en attente",
        "chnowa demandes en attente",
        "\u0634\u0646\u0648\u0629 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u0646\u064a\u0629\u061f",
    ],
)
def test_rh_backlog_multilingual_uses_modern_reads(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="RH"))
    assert response.intent == "rh.all_requests"
    assert response.actionResult["kind"] == "rh_request_summary"
    assert any(call.name == "leave.list_rh_pending" for call in response.toolCalls)
    assert any(call.name == "telework.list_rh_pending" for call in response.toolCalls)
    assert any(call.name == "authorization.list_rh_requests" for call in response.toolCalls)


@pytest.mark.parametrize("message", ["Presence aujourd'hui", "Qui n\u2019a pas point\u00e9 ?", "Retards aujourd\u2019hui"])
def test_rh_presence_today_routes_to_company_presence(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="RH"))
    assert response.intent == "rh.presence_today"
    assert any(call.name == "get_team_presence" for call in response.toolCalls)


@pytest.mark.parametrize("message", ["je veux creer un nouveau user", "nheb nzid user jdid"])
def test_rh_create_user_is_clean_capability_message(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="RH"))
    assert response.intent == "rh.create_user_unavailable"
    assert response.actionResult["kind"] == "rh_capability_unavailable"


@pytest.mark.parametrize("message", ["Document workload", "Documents en attente"])
def test_rh_document_workload_uses_document_tool(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="RH"))
    assert response.intent == "rh.document_workload"
    assert any(call.name == "document.rh_workload" for call in response.toolCalls)


def test_rh_stats_and_absenteeism_use_rh_stats_tool() -> None:
    response, _ = asyncio.run(send_chatbot_message("Taux absent\u00e9isme", role="RH"))
    assert response.intent == "rh.stats"
    assert any(call.name == "rh.get_stats" for call in response.toolCalls)


@pytest.mark.parametrize("message", ["est ce que je suis point\u00e9 ?", "pointit ou nn"])
def test_rh_personal_pointage_stays_personal_attendance(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="RH"))
    assert response.intent == "attendance.status"
    assert any(call.name == "get_pointage_status" for call in response.toolCalls)


@pytest.mark.parametrize(
    "message",
    [
        "je veux affecter user a equipe",
        "affecter Ahmed \u00e0 \u00e9quipe IA",
        "changer manager utilisateur 20",
    ],
)
def test_rh_organisation_assignment_returns_clean_unavailable(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="RH"))
    assert response.intent == "rh.organisation_assignment.unavailable"
    assert response.actionResult["kind"] == "capability_unavailable"


def test_rh_document_generation_asks_for_employee_when_missing() -> None:
    response, _ = asyncio.run(send_chatbot_message("Cr\u00e9er attestation travail", role="RH"))
    assert response.intent == "rh.document_generate"
    assert response.type == "ask"
    assert response.actionResult["kind"] == "slot_filling"


def test_rh_document_generation_requires_confirmation_when_complete() -> None:
    response, _ = asyncio.run(send_chatbot_message("Cr\u00e9er attestation travail pour Ahmed Ben Ali", role="RH"))
    assert response.intent == "rh.document_generate"
    assert response.type == "confirm_action"
    assert response.toolCalls[0].name == "document.rh_generate"
    assert response.toolCalls[0].arguments["employe_prenom"] == "Ahmed"


@pytest.mark.parametrize(
    "message",
    [
        "contrats expirent",
        "Ajouter candidat",
        "Qui doit suivre formation ?",
        "employ\u00e9s \u00e0 risque \u00e9lev\u00e9",
        "signature \u00e9lectronique",
    ],
)
def test_unsupported_rh_features_return_capability_unavailable(message: str) -> None:
    response, _ = asyncio.run(send_chatbot_message(message, role="RH"))
    assert response.actionResult["kind"] == "capability_unavailable"
    assert not response.intent.startswith("fallback.")
