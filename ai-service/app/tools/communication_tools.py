from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result, build_write_result

COMMUNICATION_ROLES = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}


class EmptyCommunicationInput(BaseModel):
    limit: int = Field(default=30, ge=1, le=100)


class ChannelMessagesInput(BaseModel):
    channel_id: UUID
    limit: int = Field(default=30, ge=1, le=100)
    before: str | None = None


class SummarizeChannelInput(BaseModel):
    channel_id: UUID
    limit: int = Field(default=50, ge=1, le=100)


class SendMessageInput(BaseModel):
    channel_id: UUID
    content: str = Field(min_length=1, max_length=4000)
    parent_message_id: UUID | None = None


class CommunicationTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="communication.list_channels",
                description="Liste les canaux de communication visibles par l'utilisateur authentifie.",
                input_model=EmptyCommunicationInput,
                output_model=None,
                type="read",
                allowed_roles=COMMUNICATION_ROLES,
            ),
            self.list_channels,
        )
        registry.register(
            ToolDefinition(
                name="communication.get_channel_messages",
                description="Lit les messages d'un canal visible par l'utilisateur authentifie.",
                input_model=ChannelMessagesInput,
                output_model=None,
                type="read",
                allowed_roles=COMMUNICATION_ROLES,
            ),
            self.get_channel_messages,
        )
        registry.register(
            ToolDefinition(
                name="communication.summarize_channel",
                description="Resume de facon deterministe les messages visibles d'un canal.",
                input_model=SummarizeChannelInput,
                output_model=None,
                type="read",
                allowed_roles=COMMUNICATION_ROLES,
            ),
            self.summarize_channel,
        )
        registry.register(
            ToolDefinition(
                name="communication.send_message",
                description="Envoie un message dans un canal visible par l'utilisateur authentifie.",
                input_model=SendMessageInput,
                output_model=None,
                type="write",
                allowed_roles=COMMUNICATION_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.send_message,
        )

    async def list_channels(self, payload: EmptyCommunicationInput, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/communication/channels", context=context)
        if not result.success:
            return self._read_failure("communication.list_channels", result)

        channels = _as_list(result.data)[: payload.limit]
        summary = _channels_summary(channels)
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="communication.list_channels",
                    summary=summary,
                    items=channels,
                    count=len(channels),
                    data={"channels": channels},
                    backend_status=result.status_code,
                    empty=not channels,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def get_channel_messages(self, payload: ChannelMessagesInput, context: CurrentUserContext) -> ToolResult:
        params: dict[str, Any] = {"limit": payload.limit}
        if payload.before:
            params["before"] = payload.before
        result = await self.backend_client.get(
            f"/communication/channels/{payload.channel_id}/messages",
            context=context,
            params=params,
        )
        if not result.success:
            return self._read_failure("communication.get_channel_messages", result)

        messages = _messages_from_page(result.data)
        summary = _messages_summary(messages)
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="communication.get_channel_messages",
                    summary=summary,
                    items=messages,
                    count=len(messages),
                    data={
                        "channelId": str(payload.channel_id),
                        "messages": messages,
                        "nextCursor": _dict_get(result.data, "nextCursor"),
                        "hasMore": bool(_dict_get(result.data, "hasMore") or False),
                    },
                    backend_status=result.status_code,
                    empty=not messages,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def summarize_channel(self, payload: SummarizeChannelInput, context: CurrentUserContext) -> ToolResult:
        messages_result = await self.get_channel_messages(
            ChannelMessagesInput(channel_id=payload.channel_id, limit=payload.limit),
            context,
        )
        if not messages_result.success:
            read_result = _read_result_from(messages_result.data)
            if read_result:
                read_result["toolName"] = "communication.summarize_channel"
            return messages_result

        source_read_result = _read_result_from(messages_result.data)
        messages = source_read_result.get("items", []) if source_read_result else []
        summary, highlights = _deterministic_channel_summary(messages)
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="communication.summarize_channel",
                    summary=summary,
                    items=highlights,
                    count=len(highlights),
                    data={
                        "kind": "communication_summary",
                        "channelId": str(payload.channel_id),
                        "messageCount": len(messages),
                        "highlights": highlights,
                    },
                    backend_status=messages_result.status_code,
                    empty=not messages,
                )
            },
            warnings=messages_result.warnings,
            status_code=messages_result.status_code,
        )

    async def send_message(self, payload: SendMessageInput, context: CurrentUserContext) -> ToolResult:
        request_id = str(context.metadata.get("request_id") or "").strip()
        body: dict[str, Any] = {
            "clientMessageId": f"ai-{request_id}" if request_id else None,
            "type": "TEXT",
            "body": payload.content.strip(),
            "richBody": None,
            "parentMessageId": str(payload.parent_message_id) if payload.parent_message_id else None,
            "mentions": [],
            "metadata": {"source": "ai_copilot"},
        }
        result = await self.backend_client.post(
            f"/communication/channels/{payload.channel_id}/messages",
            context=context,
            json={key: value for key, value in body.items() if value is not None},
        )
        if not result.success:
            return self._write_failure("communication.send_message", result)

        return ToolResult.ok(
            build_write_result(
                tool_name="communication.send_message",
                summary="Votre message a ete envoye.",
                data=result.data,
                backend_status=result.status_code,
            ),
            warnings=result.warnings,
            status_code=result.status_code,
        )

    @staticmethod
    def _read_failure(tool_name: str, result: ToolResult) -> ToolResult:
        message = _clean_read_error(result)
        return ToolResult.fail(
            result.error_code or "backend_error",
            message,
            status_code=result.status_code,
            data={
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=message,
                    items=[],
                    count=0,
                    data=result.data if isinstance(result.data, dict) else {},
                    error={"code": result.error_code, "message": message},
                    backend_status=result.status_code,
                    empty=True,
                )
            },
            warnings=result.warnings,
        )

    @staticmethod
    def _write_failure(tool_name: str, result: ToolResult) -> ToolResult:
        message = _clean_write_error(result)
        return ToolResult.fail(
            result.error_code or "backend_error",
            message,
            status_code=result.status_code,
            data=build_write_result(
                tool_name=tool_name,
                summary=message,
                data=result.data if isinstance(result.data, dict) else {},
                error={"code": result.error_code, "message": message},
                backend_status=result.status_code,
            ),
            warnings=result.warnings,
        )


def register_communication_tools(registry: ToolRegistry, backend_client: BackendClient) -> CommunicationTools:
    tools = CommunicationTools(backend_client)
    tools.register(registry)
    return tools


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("items", "content", "data", "channels", "messages"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
    return []


def _messages_from_page(value: Any) -> list[Any]:
    return _as_list(value)


def _dict_get(value: Any, key: str) -> Any:
    return value.get(key) if isinstance(value, dict) else None


def _read_result_from(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        read_result = value.get("read_result")
        if isinstance(read_result, dict):
            return read_result
    return None


def _channels_summary(channels: list[Any]) -> str:
    if not channels:
        return "Aucun canal de communication visible pour votre compte."
    unread = 0
    for channel in channels:
        if isinstance(channel, dict) and isinstance(channel.get("unreadCount"), (int, float)):
            unread += int(channel["unreadCount"])
    suffix = f" dont {unread} message(s) non lu(s)" if unread else ""
    return f"Vous avez {len(channels)} canal(aux) de communication visible(s){suffix}."


def _messages_summary(messages: list[Any]) -> str:
    if not messages:
        return "Aucun message visible dans ce canal."
    return f"J'ai recupere {len(messages)} message(s) visible(s) dans ce canal."


def _deterministic_channel_summary(messages: list[Any]) -> tuple[str, list[dict[str, Any]]]:
    if not messages:
        return "Aucun message visible a resumer dans ce canal.", []

    highlights: list[dict[str, Any]] = []
    for message in messages[-5:]:
        if not isinstance(message, dict):
            continue
        sender = _sender_name(message.get("sender"))
        body = _compact_text(message.get("body") or message.get("richBody") or "")
        if not body:
            body = "(message sans texte)"
        highlights.append(
            {
                "sender": sender,
                "createdAt": message.get("createdAt"),
                "excerpt": body,
            }
        )
    summary = f"Resume du canal: {len(messages)} message(s) visible(s)."
    if highlights:
        last = highlights[-1]
        summary += f" Dernier message de {last['sender']}: {last['excerpt']}"
    return summary, highlights


def _sender_name(sender: Any) -> str:
    if not isinstance(sender, dict):
        return "un membre"
    for key in ("resolvedFullName", "fullName", "displayName", "name", "email"):
        value = sender.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    first = str(sender.get("prenom") or sender.get("firstName") or "").strip()
    last = str(sender.get("nom") or sender.get("lastName") or "").strip()
    return " ".join(part for part in (first, last) if part) or "un membre"


def _compact_text(value: Any, limit: int = 180) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def _clean_read_error(result: ToolResult) -> str:
    if result.status_code in (401, 403):
        return "Vous n'avez pas les droits necessaires pour consulter ce canal."
    if result.status_code == 404:
        return "Ce canal ou ces messages sont introuvables."
    if result.status_code == 400:
        return "L'identifiant du canal est invalide."
    if result.status_code is None or result.status_code >= 500:
        return "Le service communication est momentanement indisponible. Reessayez dans quelques instants."
    return result.error_message or "Impossible de recuperer les donnees de communication."


def _clean_write_error(result: ToolResult) -> str:
    if result.status_code in (401, 403):
        return "Vous n'avez pas les droits necessaires pour envoyer un message dans ce canal."
    if result.status_code == 404:
        return "Ce canal est introuvable."
    if result.status_code == 400:
        return "Le message est incomplet ou le canal est invalide."
    if result.status_code == 409:
        return "Ce message ne peut pas etre envoye dans l'etat actuel du canal."
    if result.status_code is None or result.status_code >= 500:
        return "Le service communication est momentanement indisponible. Reessayez dans quelques instants."
    return result.error_message or "Impossible d'envoyer ce message."
