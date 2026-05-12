from __future__ import annotations

import re
import uuid
from contextvars import ContextVar, Token

REQUEST_ID_MAX_LENGTH = 128
REQUEST_ID_PATTERN = re.compile(r"[^A-Za-z0-9._:-]")

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def normalize_request_id(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    if not cleaned:
        return None
    cleaned = REQUEST_ID_PATTERN.sub("-", cleaned)
    return cleaned[:REQUEST_ID_MAX_LENGTH] or None


def generate_request_id() -> str:
    return str(uuid.uuid4())


def get_request_id() -> str | None:
    return _request_id.get()


def ensure_request_id(value: str | None = None) -> str:
    existing = normalize_request_id(value) or get_request_id()
    return existing or generate_request_id()


def set_request_id(value: str | None = None) -> Token[str | None]:
    return _request_id.set(ensure_request_id(value))


def reset_request_id(token: Token[str | None] | None) -> None:
    if token is not None:
        _request_id.reset(token)
