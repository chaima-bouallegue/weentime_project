from __future__ import annotations

import hashlib
import json
from typing import Any


TRANSIENT_ENTITY_KEYS = {
    "raw_text",
    "normalized_text",
    "action_key",
    "incomplete",
    "validation_errors",
}


def _clean_payload(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key in sorted(value):
            if key in TRANSIENT_ENTITY_KEYS:
                continue
            item = value[key]
            if item in (None, "", [], {}):
                continue
            cleaned[key] = _clean_payload(item)
        return cleaned
    if isinstance(value, list):
        return [_clean_payload(item) for item in value if item not in (None, "", [], {})]
    return value


def build_action_key(
    user_id: int,
    intent: str,
    role: str,
    entities: dict[str, Any] | None = None,
) -> str:
    payload = {
        "user_id": user_id,
        "intent": intent,
        "role": (role or "EMPLOYEE").upper(),
        "entities": _clean_payload(entities or {}),
    }
    encoded = json.dumps(payload, ensure_ascii=True, sort_keys=True, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
