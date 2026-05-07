from __future__ import annotations

import re
from typing import Any

from config import get_settings

JWT_PATTERN = re.compile(r"\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
BEARER_PATTERN = re.compile(r"Bearer\s+[A-Za-z0-9._-]+", re.IGNORECASE)
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
AUDIO_KEYS = {"audio", "audio_bytes", "raw_audio", "file", "audio_file", "bytes", "content"}
SECRET_KEYS = {
    "authorization",
    "access_token",
    "token",
    "jwt",
    "api_key",
    "api-key",
    "x-api-key",
    "braintrust_api_key",
    "braintrust-api-key",
}


def redact_value(value: Any, *, log_inputs: bool | None = None) -> Any:
    settings = get_settings()
    should_log_inputs = settings.braintrust_log_inputs if log_inputs is None else log_inputs

    if isinstance(value, bytes):
        return "[redacted-bytes]"
    if isinstance(value, str):
        text = BEARER_PATTERN.sub("Bearer [redacted]", value)
        text = JWT_PATTERN.sub("[redacted-jwt]", text)
        if settings.braintrust_api_key:
            text = text.replace(settings.braintrust_api_key, "[redacted-braintrust-api-key]")
        if settings.braintrust_redact_emails:
            text = EMAIL_PATTERN.sub("[redacted-email]", text)
        if not should_log_inputs and len(text) > 0:
            return f"[redacted-text:{len(text)}]"
        if len(text) > settings.braintrust_max_text_length:
            return text[: settings.braintrust_max_text_length] + "...[truncated]"
        return text
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            normalized_key = str(key).lower()
            if normalized_key in SECRET_KEYS:
                redacted[str(key)] = "[redacted]"
            elif normalized_key in AUDIO_KEYS:
                redacted[str(key)] = "[redacted-audio]"
            else:
                redacted[str(key)] = redact_value(item, log_inputs=log_inputs)
        return redacted
    if isinstance(value, list):
        return [redact_value(item, log_inputs=log_inputs) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_value(item, log_inputs=log_inputs) for item in value)
    return value


def redact_headers(headers: dict[str, Any] | None) -> dict[str, Any]:
    return redact_value(dict(headers or {}), log_inputs=True)
