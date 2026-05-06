from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


AgentResponseType = Literal["answer", "ask", "confirm_action", "execute_action", "error"]


class ToolCallRecord(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    status: str | None = None


class AgentResponse(BaseModel):
    type: AgentResponseType
    text: str
    intent: str
    confidence: float = 0.0
    requiresConfirmation: bool = False
    confirmationId: str | None = None
    toolCalls: list[ToolCallRecord] = Field(default_factory=list)
    actionResult: dict[str, Any] | None = None


class ChatV2Request(BaseModel):
    message: str
    session_id: str | None = None
    channel: Literal["chat", "voice"] = "chat"
    user_id: int | None = None


class ConfirmActionRequest(BaseModel):
    confirmation_id: str
    approved: bool
