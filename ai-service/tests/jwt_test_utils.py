from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

TEST_JWT_SECRET = "test-secret-key-with-at-least-256-bits"


def make_token(claims: dict[str, Any], *, secret: str = TEST_JWT_SECRET) -> str:
    payload = dict(claims)
    payload.setdefault("exp", int(time.time()) + 3600)
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = f"{_encode(header)}.{_encode(payload)}"
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    return f"{signing_input}.{_encode_bytes(signature)}"


def make_unsigned_token(claims: dict[str, Any]) -> str:
    payload = dict(claims)
    payload.setdefault("exp", int(time.time()) + 3600)
    signing_input = f"{_encode({'alg': 'HS256', 'typ': 'JWT'})}.{_encode(payload)}"
    return f"{signing_input}.signature"


def _encode(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return _encode_bytes(raw)


def _encode_bytes(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

