from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.core.conversation_state import PendingConversationFlow
from app.models.agent_models import AgentResponse

from .session_state import SessionState, utc_now


def serialize_session_state(state: SessionState) -> str:
    payload = {
        "request_id": state.request_id,
        "session_id": state.session_id,
        "user_id": state.user_id,
        "tenant_id": state.tenant_id,
        "role": state.role,
        "language": state.language,
        "channel": state.channel,
        "current_page": state.current_page,
        "conversation_id": state.conversation_id,
        "company_id": state.company_id,
        "intent": state.intent,
        "selected_agent": state.selected_agent,
        "pending_confirmation": state.pending_confirmation,
        "recent_context": list(state.recent_context),
        "tool_history": list(state.tool_history),
        "last_safe_response": state.last_safe_response,
        "pending_flow": state.pending_flow,
        "updated_at": _datetime_to_string(state.updated_at),
        "expires_at": _datetime_to_string(state.expires_at),
    }
    return json.dumps(payload, ensure_ascii=True, separators=(",", ":"))


def deserialize_session_state(payload: str | bytes | None) -> SessionState | None:
    if payload is None:
        return None
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8", errors="ignore")
    if not str(payload).strip():
        return None
    data = json.loads(payload)
    return SessionState(
        request_id=str(data.get("request_id") or ""),
        session_id=str(data.get("session_id") or "default"),
        user_id=int(data.get("user_id") or 0),
        tenant_id=_to_optional_int(data.get("tenant_id")),
        role=str(data.get("role") or "EMPLOYEE"),
        language=str(data.get("language") or "unknown"),
        channel=str(data.get("channel") or "chat"),
        current_page=_to_optional_str(data.get("current_page")),
        conversation_id=_to_optional_str(data.get("conversation_id")),
        company_id=_to_optional_str(data.get("company_id")),
        intent=_to_optional_str(data.get("intent")),
        selected_agent=_to_optional_str(data.get("selected_agent")),
        pending_confirmation=_as_dict(data.get("pending_confirmation")),
        recent_context=_as_dict_list(data.get("recent_context")),
        tool_history=_as_dict_list(data.get("tool_history")),
        last_safe_response=_as_dict(data.get("last_safe_response")),
        pending_flow=_as_dict(data.get("pending_flow")),
        updated_at=_parse_datetime(data.get("updated_at")) or utc_now(),
        expires_at=_parse_datetime(data.get("expires_at")),
    )


def serialize_pending_flow(flow: PendingConversationFlow | None) -> dict[str, Any] | None:
    if flow is None:
        return None
    return {
        "intent": flow.intent,
        "agent": flow.agent,
        "collected_fields": dict(flow.collected_fields),
        "missing_fields": list(flow.missing_fields),
        "last_question": flow.last_question,
        "status": flow.status,
        "language": flow.language,
        "role": flow.role,
        "current_page": flow.current_page,
        "last_action": flow.last_action,
        "created_at": _datetime_to_string(flow.created_at),
        "expires_at": _datetime_to_string(flow.expires_at),
    }


def deserialize_pending_flow(data: dict[str, Any] | None) -> PendingConversationFlow | None:
    if not isinstance(data, dict) or not data:
        return None
    flow = PendingConversationFlow(
        intent=str(data.get("intent") or ""),
        agent=str(data.get("agent") or ""),
        collected_fields=_as_dict(data.get("collected_fields")) or {},
        missing_fields=[str(item) for item in data.get("missing_fields") or []],
        last_question=_to_optional_str(data.get("last_question")),
        status=str(data.get("status") or "pending"),
        language=_to_optional_str(data.get("language")),
        role=_to_optional_str(data.get("role")),
        current_page=_to_optional_str(data.get("current_page")),
        last_action=_to_optional_str(data.get("last_action")),
    )
    created_at = _parse_datetime(data.get("created_at"))
    expires_at = _parse_datetime(data.get("expires_at"))
    if created_at is not None:
        flow.created_at = created_at
    if expires_at is not None:
        flow.expires_at = expires_at
    if flow.expired or flow.status != "pending":
        return None
    return flow


def deserialize_agent_response(payload: dict[str, Any] | None) -> AgentResponse | None:
    if not isinstance(payload, dict) or not payload:
        return None
    return AgentResponse.model_validate(payload)


def _datetime_to_string(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value)
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _as_dict(value: Any) -> dict[str, Any] | None:
    return dict(value) if isinstance(value, dict) else None


def _as_dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def _to_optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_optional_str(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None
