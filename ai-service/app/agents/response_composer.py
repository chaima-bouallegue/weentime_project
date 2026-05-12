from __future__ import annotations

from typing import Any

from app.models.agent_models import AgentResponse
from app.tools.result import ToolResult, get_read_result


def compose_tool_error(intent: str, result: ToolResult) -> AgentResponse:
    read_result = get_read_result(result.data)
    if read_result:
        return AgentResponse(
            type="error",
            text=str(read_result.get("summary") or result.error_message or "Impossible de recuperer ces donnees pour le moment."),
            intent=intent,
            confidence=0.9,
            actionResult=result.model_dump(mode="json"),
        )
    return AgentResponse(
        type="error",
        text=result.error_message or "L'action n'a pas pu etre executee.",
        intent=intent,
        confidence=0.9,
        actionResult=result.model_dump(mode="json"),
    )


def compose_read_response(intent: str, result: ToolResult, *, fallback_text: str, confidence: float = 0.88) -> AgentResponse:
    if not result.success:
        return compose_tool_error(intent, result)

    read_result = get_read_result(result.data)
    text = fallback_text
    if read_result:
        text = str(read_result.get("summary") or fallback_text)
    elif isinstance(result.data, dict):
        text_value = result.data.get("text") or result.data.get("message")
        if isinstance(text_value, str) and text_value.strip():
            text = text_value.strip()

    return AgentResponse(
        type="answer",
        text=text,
        intent=intent,
        confidence=confidence,
        actionResult=result.model_dump(mode="json"),
    )


def compact_value(value: Any) -> str:
    if value in (None, "", [], {}):
        return "non renseigne"
    return str(value)
