"""AI-FE-MASTER-CHATBOT-01 — telework follow-up slot filling.

Before this fix, after "je veux un teletravail" the agent asked for a date,
and the follow-up "pour demain" lost the pending intent because
telework.create was not declared in FLOW_CONFIG. The follow-up then went to
the legacy/LLM path and was rejected as unsafe.
"""

from __future__ import annotations

from app.core.slot_filling import (
    FLOW_CONFIG,
    _merge_telework_fields,
    _missing_fields,
    _tool_input,
    _question_for_missing,
)
from app.core.conversation_state import PendingConversationFlow


def test_telework_create_is_in_flow_config() -> None:
    assert "telework.create" in FLOW_CONFIG
    cfg = FLOW_CONFIG["telework.create"]
    assert cfg["agent"] == "telework"
    assert cfg["entity_intent"] == "CREATE_TELEWORK"
    assert cfg["tool"] == "telework.create_request"


def test_telework_missing_date_then_pour_demain_completes_flow() -> None:
    flow = PendingConversationFlow(
        intent="telework.create",
        agent="telework",
        last_question="Pour quelle date souhaitez-vous demander le teletravail ?",
    )
    # Simulate the slot extractor producing a date from "pour demain".
    payload = {
        "start_date": "2026-05-17",
        "end_date": "2026-05-17",
        "telework_type": "JOURNEE_COMPLETE",
    }
    _merge_telework_fields(flow.collected_fields, payload, "pour demain")
    flow.missing_fields = _missing_fields(flow)
    assert flow.missing_fields == []

    tool_input = _tool_input(flow)
    assert tool_input["start_date"] == "2026-05-17"
    assert tool_input["end_date"] == "2026-05-17"
    assert tool_input["telework_type"] == "JOURNEE_COMPLETE"


def test_telework_missing_type_is_asked_before_creation() -> None:
    flow = PendingConversationFlow(
        intent="telework.create",
        agent="telework",
        last_question="Pour quelle date souhaitez-vous demander le teletravail ?",
    )
    payload = {"start_date": "2026-05-17", "end_date": "2026-05-17"}
    _merge_telework_fields(flow.collected_fields, payload, "demain")
    missing = _missing_fields(flow)
    assert missing == ["type"]
    assert "journee complete" in _question_for_missing("telework.create", "type", flow).lower()


def test_morning_keyword_infers_demi_journee_matin() -> None:
    flow = PendingConversationFlow(
        intent="telework.create",
        agent="telework",
        last_question="?",
    )
    payload = {"start_date": "2026-05-17", "end_date": "2026-05-17"}
    _merge_telework_fields(flow.collected_fields, payload, "demain matin")
    assert flow.collected_fields["telework_type"] == "DEMI_JOURNEE_MATIN"
