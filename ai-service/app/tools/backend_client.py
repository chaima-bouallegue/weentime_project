from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.context.chatbot_backend_token import mint_chatbot_backend_token
from app.context.current_user import CurrentUserContext
from app.observability.request_context import get_request_id
from app.observability.tracing import log_error, log_event, start_span

from .result import ToolResult

DEFAULT_BACKEND_BASE_URL = "http://localhost:8322/api/v1"
logger = logging.getLogger(__name__)


class BackendClient:
    """Gateway client for v2 tools. It owns URL normalization and JWT forwarding."""

    def __init__(self, base_url: str | None = None, *, timeout: float = 20.0) -> None:
        self.base_url = self._normalize_base(base_url or os.getenv("BACKEND_BASE_URL") or DEFAULT_BACKEND_BASE_URL)
        self.timeout = timeout

    def build_url(self, path: str) -> str:
        endpoint = (path or "").strip()
        if not endpoint:
            return self.base_url
        endpoint = "/" + endpoint.lstrip("/")
        endpoint = endpoint.replace("/api/v1/api/v1/", "/api/v1/")
        if endpoint.lower().startswith("/api/v1/"):
            endpoint = endpoint[7:]
        elif endpoint.lower() == "/api/v1":
            endpoint = ""
        return f"{self.base_url}{endpoint}"

    async def get(
        self,
        path: str,
        *,
        context: CurrentUserContext,
        params: dict[str, Any] | None = None,
        tool_name: str | None = None,
        success_status_codes: set[int] | None = None,
    ) -> ToolResult:
        return await self.request(
            "GET",
            path,
            context=context,
            params=params,
            tool_name=tool_name,
            success_status_codes=success_status_codes,
        )

    async def post(
        self,
        path: str,
        *,
        context: CurrentUserContext,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        tool_name: str | None = None,
        success_status_codes: set[int] | None = None,
    ) -> ToolResult:
        return await self.request(
            "POST",
            path,
            context=context,
            json=json,
            headers=headers,
            tool_name=tool_name,
            success_status_codes=success_status_codes,
        )

    async def request(
        self,
        method: str,
        path: str,
        *,
        context: CurrentUserContext,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        tool_name: str | None = None,
        success_status_codes: set[int] | None = None,
    ) -> ToolResult:
        request_headers = dict(headers or {})
        if context.token:
            request_headers["Authorization"] = f"Bearer {context.token}"
        else:
            # Public-mode opt-in: mint a short-lived backend JWT for the
            # metadata-claimed identity so Spring can authorise the call.
            # Returns None when the operator hasn't opted in or no signing
            # secret is configured -- in that case the request goes
            # unauthenticated and Spring 401s, which is the safe default.
            minted = mint_chatbot_backend_token(context)
            if minted:
                request_headers["Authorization"] = f"Bearer {minted}"
                request_headers.setdefault("X-Weentime-Chatbot-Origin", "ai-chatbot-public")
        request_id = get_request_id() or str(context.metadata.get("request_id") or "") or None
        if request_id:
            request_headers["X-Request-ID"] = request_id

        url = self.build_url(path)

        try:
            with start_span(
                "tool.backend.call",
                {
                    "method": method.upper(),
                    "path": path,
                    "request_id": request_id,
                    "tenant_id": context.tenant_id,
                    "role": context.role,
                },
            ):
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.request(
                        method,
                        url,
                        params=params,
                        json=json,
                        headers=request_headers,
                    )
        except httpx.RequestError as exc:
            self._log_structured_backend_response(
                context=context,
                tool_name=tool_name,
                endpoint=url,
                status_code=503,
                body=str(exc),
            )
            log_error(
                "tool.error",
                exc,
                {"method": method.upper(), "path": path, "request_id": request_id, "error_code": "backend_unavailable"},
            )
            return ToolResult.fail("backend_unavailable", str(exc), status_code=503)
        except Exception as exc:  # noqa: BLE001
            self._log_structured_backend_response(
                context=context,
                tool_name=tool_name,
                endpoint=url,
                status_code=503,
                body=str(exc),
            )
            log_error(
                "tool.error",
                exc,
                {"method": method.upper(), "path": path, "request_id": request_id, "error_code": "backend_unavailable"},
            )
            return ToolResult.fail("backend_unavailable", str(exc), status_code=503)

        self._log_structured_backend_response(
            context=context,
            tool_name=tool_name,
            endpoint=url,
            status_code=response.status_code,
            body=response.text,
        )
        result = self._to_tool_result(response, success_status_codes=success_status_codes)
        log_event(
            "tool.backend.response",
            output={"success": result.success, "error_code": result.error_code, "status_code": result.status_code},
            metadata={"method": method.upper(), "path": path, "request_id": request_id},
        )
        return result

    def _to_tool_result(
        self,
        response: httpx.Response,
        *,
        success_status_codes: set[int] | None = None,
    ) -> ToolResult:
        try:
            payload: Any = response.json()
        except ValueError:
            payload = response.text

        if response.status_code >= 400:
            return ToolResult.fail(
                self._extract_error_code(payload) or f"http_{response.status_code}",
                self._extract_error_message(payload) or "Backend request failed.",
                status_code=response.status_code,
                data=payload if isinstance(payload, dict) else None,
            )

        if success_status_codes is not None and response.status_code not in success_status_codes:
            return ToolResult.fail(
                "backend_error",
                self._extract_error_message(payload) or f"Unexpected backend status: {response.status_code}.",
                status_code=response.status_code,
                data=payload if isinstance(payload, dict) else {"body": str(payload)},
            )

        if isinstance(payload, dict) and "success" in payload:
            if payload.get("success") is False:
                return ToolResult.fail(
                    self._extract_error_code(payload) or "backend_error",
                    self._extract_error_message(payload) or "Backend returned an error.",
                    status_code=response.status_code,
                    data=payload.get("data"),
                    warnings=self._read_warnings(payload),
                )
            return ToolResult.ok(payload.get("data"), warnings=self._read_warnings(payload), status_code=response.status_code)

        return ToolResult.ok(payload, status_code=response.status_code)

    @staticmethod
    def _normalize_base(base_url: str) -> str:
        base = (base_url or DEFAULT_BACKEND_BASE_URL).strip().rstrip("/")
        base = base.replace("/api/v1/api/v1", "/api/v1")
        if base.lower().endswith("/api/v1"):
            return base
        if base.lower().endswith("/api"):
            return f"{base}/v1"
        return f"{base}/api/v1"

    @staticmethod
    def _read_warnings(payload: dict[str, Any]) -> list[str]:
        warnings = payload.get("warnings")
        return [str(item) for item in warnings] if isinstance(warnings, list) else []

    @staticmethod
    def _extract_error_code(payload: Any) -> str | None:
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                code = error.get("code") or error.get("error")
                return str(code) if code else None
            code = payload.get("code") or payload.get("status")
            return str(code) if code else None
        return None

    @staticmethod
    def _extract_error_message(payload: Any) -> str | None:
        if isinstance(payload, str) and payload.strip():
            return payload.strip()
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                message = error.get("message") or error.get("error")
                return str(message) if message else None
            for key in ("message", "error", "text"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return None

    @staticmethod
    def _log_structured_backend_response(
        *,
        context: CurrentUserContext,
        tool_name: str | None,
        endpoint: str,
        status_code: int,
        body: str,
    ) -> None:
        if not tool_name:
            return
        logger.info(
            {
                "user": context.user_id,
                "tool": tool_name,
                "endpoint": endpoint,
                "status": status_code,
                "body": body,
            }
        )
