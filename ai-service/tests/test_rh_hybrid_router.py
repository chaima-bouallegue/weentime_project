from __future__ import annotations

import asyncio

from app.agents.hybrid_intent_router import classify_rh_intent
from app.agents.llm_intent_classifier import parse_llm_intent_json
from chatbot_test_helpers import send_chatbot_message


def test_department_page_uses_hybrid_intent_not_attendance() -> None:
    response, state = asyncio.run(
        send_chatbot_message(
            "aamel departement engineering",
            role="RH",
            current_page="/app/rh/structure/departments",
        )
    )

    assert response.intent == "organisation.create_department"
    assert response.type == "ask"
    assert not response.intent.startswith("attendance.")
    assert not any(call[1] == "/presence/me/check-out" for call in state.copilot_backend_client.calls)


def test_hybrid_classifier_returns_structured_json_result() -> None:
    result = classify_rh_intent("warini horaires", current_page="/app/rh/horaires")

    assert result.intent == "rh.schedule.list"
    assert result.confidence >= 0.85
    assert result.source in {"deterministic", "page_context"}


def test_llm_classifier_parser_accepts_json_only_and_cannot_execute_tools() -> None:
    result = parse_llm_intent_json('{"intent":"rh.leave.pending","confidence":0.73,"entities":{},"missing":[],"reason":"ambiguous"}')

    assert result.intent == "rh.leave.pending"
    assert result.confidence == 0.73
    assert result.source == "llm"


def test_llm_classifier_parser_rejects_non_json_answer() -> None:
    result = parse_llm_intent_json("Je vais approuver cette demande.")

    assert result.intent is None
    assert result.confidence == 0.0
