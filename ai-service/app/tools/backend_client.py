from __future__ import annotations

import os
from typing import Any

import httpx

from app.context.current_user import CurrentUserContext
from .result import ToolResult

DEFAULT_BACKEND_BASE_URL = "http://localhost:8222/api/v1"


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

    async def get(self, path: str, *, context: CurrentUserContext, params: dict[str, Any] | None = None) -> ToolResult:
        return await self.request("GET", path, context=context, params=params)

    async def post(
        self,
        path: str,
        *,
        context: CurrentUserContext,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ToolResult:
        return await self.request("POST", path, context=context, json=json, headers=headers)

    async def request(
        self,
        method: str,
        path: str,
        *,
        context: CurrentUserContext,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ToolResult:
        request_headers = dict(headers or {})
        if context.token:
            request_headers["Authorization"] = f"Bearer {context.token}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method,
                    self.build_url(path),
                    params=params,
                    json=json,
                    headers=request_headers,
                )
        except httpx.RequestError as exc:
            return ToolResult.fail("backend_unreachable", str(exc), status_code=503)

        return self._to_tool_result(response)

    def _to_tool_result(self, response: httpx.Response) -> ToolResult:
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
