from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult
from core.entity_extractor import extract_entities


def has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def extract_payload(message: str, intent: str, context: CurrentUserContext) -> dict[str, Any]:
    return {
        key: value
        for key, value in extract_entities(message, intent=intent, role=context.role).items()
        if value not in (None, "", [], {})
    }


def tool_success_text(default: str, result: ToolResult) -> str:
    if isinstance(result.data, dict):
        text = result.data.get("text") or result.data.get("message")
        if isinstance(text, str) and text.strip():
            return text.strip()
    return default


def error_response(intent: str, result: ToolResult) -> AgentResponse:
    return AgentResponse(
        type="error",
        text=result.error_message or "L'action n'a pas pu etre executee.",
        intent=intent,
        confidence=0.9,
        actionResult=result.model_dump(mode="json"),
    )


class ConfirmationMixin:
    executor: ToolExecutor
    confirmation_store: ConfirmationStore

    def confirmation_response(
        self,
        *,
        context: CurrentUserContext,
        tool_name: str,
        tool_input: dict[str, Any],
        intent: str,
        text: str,
        confidence: float = 0.9,
    ) -> AgentResponse:
        record = self.confirmation_store.create(context, tool_name, tool_input)
        return AgentResponse(
            type="confirm_action",
            text=text,
            intent=intent,
            confidence=confidence,
            requiresConfirmation=True,
            confirmationId=record.confirmation_id,
            toolCalls=[ToolCallRecord(name=tool_name, arguments=tool_input, status="pending_confirmation")],
        )

    async def read_response(
        self,
        *,
        tool_name: str,
        tool_input: dict[str, Any] | None,
        context: CurrentUserContext,
        intent: str,
        success_text: str,
        confidence: float = 0.88,
    ) -> AgentResponse:
        result = await self.executor.execute(tool_name, tool_input or {}, context)
        if not result.success:
            return error_response(intent, result)
        return AgentResponse(
            type="answer",
            text=tool_success_text(success_text, result),
            intent=intent,
            confidence=confidence,
            toolCalls=[ToolCallRecord(name=tool_name, arguments=tool_input or {}, status="success")],
            actionResult=result.model_dump(mode="json"),
        )
