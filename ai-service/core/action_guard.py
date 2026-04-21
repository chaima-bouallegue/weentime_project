from __future__ import annotations

from typing import Any

from core.action_map import (
    action_for_intent,
    is_mutating_intent,
    is_navigation_intent,
    is_query_intent,
    required_fields_for_intent,
    role_can_execute,
)


def required_fields(intent: str) -> tuple[str, ...]:
    return required_fields_for_intent(intent)


def missing_fields(intent: str, entities: dict[str, Any] | None = None) -> list[str]:
    payload = entities or {}
    missing = [field for field in required_fields(intent) if payload.get(field) in (None, "", [], {})]

    if intent == "CREATE_TELEWORK" and payload.get("telework_type") in (None, "", [], {}):
        payload["telework_type"] = "JOURNEE_COMPLETE"

    if intent == "CREATE_LEAVE" and not payload.get("leave_type_label"):
        payload["leave_type_label"] = "Conge annuel"

    return missing


def validation_errors(intent: str, entities: dict[str, Any] | None = None) -> list[str]:
    payload = entities or {}
    errors: list[str] = []

    if intent in {"CREATE_LEAVE", "CREATE_TELEWORK"}:
        start_date = payload.get("start_date")
        end_date = payload.get("end_date")
        if start_date and end_date and start_date > end_date:
            errors.append("invalid_date_range")

    if intent == "CREATE_AUTORISATION":
        time_start = payload.get("time_start")
        time_end = payload.get("time_end")
        if time_start and time_end and time_start > time_end:
            errors.append("invalid_time_range")

    return errors


def role_errors(intent: str, role: str) -> list[str]:
    return [] if role_can_execute(intent, role) else ["forbidden_for_role"]


__all__ = [
    "action_for_intent",
    "is_mutating_intent",
    "is_navigation_intent",
    "is_query_intent",
    "missing_fields",
    "required_fields",
    "role_errors",
    "validation_errors",
]
