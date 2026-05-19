"""HTTP client to the WeenTime Spring backend.

Mirrors ai-service/app/tools/backend_client.py: forwards the caller's Bearer
token if present; otherwise mints a short-lived service JWT signed with the
shared ``BACKEND_JWT_SECRET`` so the gateway will accept the call.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _mint_service_token(user_id: int, role: str, tenant_id: int | None) -> str:
    settings = get_settings()
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": "ml-service",
        "userId": user_id,
        "roles": [role],
        "entrepriseId": tenant_id,
        "iss": settings.backend_jwt_issuer,
        "iat": now,
        "exp": now + settings.backend_jwt_ttl_seconds,
    }
    header_b = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b}.{payload_b}".encode()
    # presence-service stores the secret as hex; tolerate both hex and raw.
    secret = settings.backend_jwt_secret
    try:
        key = bytes.fromhex(secret)
    except ValueError:
        key = secret.encode()
    signature = hmac.new(key, signing_input, hashlib.sha256).digest()
    return f"{header_b}.{payload_b}.{_b64url(signature)}"


class WeenTimeBackendClient:
    def __init__(self, base_url: str | None = None, timeout: float | None = None) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.backend_base_url).rstrip("/")
        self.timeout = timeout if timeout is not None else settings.backend_timeout_seconds

    async def get(
        self,
        path: str,
        *,
        token: str | None = None,
        user_id: int = 0,
        role: str = "RH",
        tenant_id: int | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        bearer = token or _mint_service_token(user_id or 1, role, tenant_id)
        headers = {"Authorization": f"Bearer {bearer}", "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.HTTPError as exc:
            logger.warning("backend GET %s failed: %s", url, exc)
            return {"success": False, "error": "backend_unreachable", "message": str(exc)}

        if response.status_code >= 400:
            logger.info("backend GET %s -> %d", url, response.status_code)
            return {
                "success": False,
                "error": "backend_error",
                "status_code": response.status_code,
                "body": response.text[:500],
            }
        try:
            return response.json()
        except ValueError:
            return {"success": False, "error": "invalid_json", "body": response.text[:500]}
