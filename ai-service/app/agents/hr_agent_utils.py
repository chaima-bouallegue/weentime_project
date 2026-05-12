from __future__ import annotations

import unicodedata
from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult
from core.entity_extractor import extract_entities

from .response_composer import compose_read_response


def has_any(text: str, terms: tuple[str, ...]) -> bool:
    if any(term in text for term in terms):
        return True
    normalized_text = _strip_accents(text)
    return any(_strip_accents(term) in normalized_text for term in terms)


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(char for char in normalized if not unicodedata.combining(char))


def extract_payload(message: str, intent: str, context: CurrentUserContext) -> dict[str, Any]:
    return {
        key: value
        for key, value in extract_entities(message, intent=intent, role=context.role).items()
        if value not in (None, "", [], {})
    }


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
        action_result: dict[str, Any] | None = None,
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
            actionResult=action_result,
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
        response = compose_read_response(intent, result, fallback_text=success_text, confidence=confidence)
        response.toolCalls = [
            ToolCallRecord(
                name=tool_name,
                arguments=tool_input or {},
                status="success" if result.success else "failed",
            )
        ]
        return response
