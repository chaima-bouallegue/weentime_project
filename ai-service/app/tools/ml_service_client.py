"""HTTP client to the WeenTime ML service (port 8001).

Mirrors the shape of ``app.tools.backend_client.BackendClient`` -- forwards the
authenticated user's bearer token when present, falls back to a minted service
token for public-mode flows. Always returns a ``ToolResult``.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.context.chatbot_backend_token import mint_chatbot_backend_token
from app.context.current_user import CurrentUserContext
from app.observability.request_context import get_request_id

from .result import ToolResult

DEFAULT_ML_SERVICE_BASE_URL = "http://localhost:8001"
logger = logging.getLogger(__name__)


class MLServiceClient:
    """Read-only client for the ml-service anomaly endpoints."""

    def __init__(self, base_url: str | None = None, *, timeout: float = 15.0) -> None:
        self.base_url = (base_url or os.getenv("ML_SERVICE_BASE_URL") or DEFAULT_ML_SERVICE_BASE_URL).rstrip("/")
        self.timeout = timeout

    def build_url(self, path: str) -> str:
        endpoint = (path or "").strip()
        if not endpoint:
            return self.base_url
        endpoint = "/" + endpoint.lstrip("/")
        return f"{self.base_url}{endpoint}"

    async def get(
        self,
        path: str,
        *,
        context: CurrentUserContext,
        params: dict[str, Any] | None = None,
        tool_name: str | None = None,
    ) -> ToolResult:
        headers: dict[str, str] = {"Accept": "application/json"}
        if context.token:
            headers["Authorization"] = f"Bearer {context.token}"
        else:
            minted = mint_chatbot_backend_token(context)
            if minted:
                headers["Authorization"] = f"Bearer {minted}"

        # Stable headers the ml-service uses to fan out to the Spring gateway
        # when the caller didn't bring a token.
        user_id = getattr(context, "user_id", None)
        if user_id:
            headers["X-User-Id"] = str(user_id)
        tenant_id = getattr(context, "tenant_id", None)
        if tenant_id is not None:
            headers["X-Tenant-Id"] = str(tenant_id)
        request_id = get_request_id() or None
        if request_id:
            headers["X-Request-ID"] = request_id

        url = self.build_url(path)
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.HTTPError as exc:
            logger.warning("ml-service GET %s failed: %s", url, exc)
            return ToolResult.fail(
                "ml_service_unreachable",
                "Service ML temporairement indisponible.",
                status_code=503,
            )

        if response.status_code >= 400:
            logger.info("ml-service GET %s -> %d (tool=%s)", url, response.status_code, tool_name)
            return ToolResult.fail(
                "ml_service_error",
                f"Le service ML a retourné une erreur ({response.status_code}).",
                status_code=response.status_code,
            )
        try:
            return ToolResult.ok(data=response.json(), status_code=response.status_code)
        except ValueError:
            return ToolResult.fail("ml_service_bad_json", "Réponse ML invalide.", status_code=502)
