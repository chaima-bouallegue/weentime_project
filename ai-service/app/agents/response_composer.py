from __future__ import annotations

from typing import Any

from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult


def compose_tool_error(intent: str, result: ToolResult) -> AgentResponse:
    return AgentResponse(
        type="error",
        text=result.error_message or "L'action n'a pas pu etre executee.",
        intent=intent,
        confidence=0.9,
        actionResult=result.model_dump(mode="json"),
    )


def compact_value(value: Any) -> str:
    if value in (None, "", [], {}):
        return "non renseigne"
    return str(value)
