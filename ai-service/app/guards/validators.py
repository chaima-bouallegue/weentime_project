from __future__ import annotations

from typing import Any

from app.models.agent_models import AgentResponse

from .contracts import SAFE_AUTHORITATIVE_RESPONSE_KINDS


def action_kind(response: AgentResponse) -> str | None:
    action = response.actionResult if isinstance(response.actionResult, dict) else {}
    value = action.get("kind")
    return str(value) if value is not None else None


def has_safe_response_contract(response: AgentResponse) -> bool:
    kind = action_kind(response)
    return kind in SAFE_AUTHORITATIVE_RESPONSE_KINDS


def nested_read_result(action: dict[str, Any]) -> dict[str, Any] | None:
    data = action.get("data")
    if isinstance(data, dict):
        read_result = data.get("read_result")
        if isinstance(read_result, dict) and read_result.get("kind") == "read_result":
            return read_result

    read_result = action.get("read_result")
    if isinstance(read_result, dict) and read_result.get("kind") == "read_result":
        return read_result

    return None
