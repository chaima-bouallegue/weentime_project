from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from config import Settings

logger = logging.getLogger(__name__)


@dataclass
class ToolResult:
    success: bool
    tool: str
    status: str = "success"
    text: str = ""
    data: Any = None
    error: str | None = None
    status_code: int | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class BinaryResult:
    success: bool
    tool: str
    content: bytes | None = None
    filename: str | None = None
    content_type: str | None = None
    error: str | None = None
    status_code: int | None = None
    details: dict[str, Any] = field(default_factory=dict)


class ApiClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = httpx.AsyncClient(
            base_url=self.settings.backend_base_url,
            timeout=self.settings.backend_timeout_seconds,
            follow_redirects=True,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def request(
        self,
        method: str,
        endpoint: str,
        *,
        access_token: str | None = None,
        expected_statuses: set[int] | None = None,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> ToolResult:
        expected = expected_statuses or {200, 201, 204}
        resolved_path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
        last_error: str | None = None
        last_payload: Any = None
        last_status: int | None = None

        for attempt in range(1, self.settings.backend_retry_attempts + 1):
            try:
                response = await self._client.request(
                    method.upper(),
                    resolved_path,
                    headers=self._headers(access_token),
                    json=json_body,
                    params=params,
                )
                last_status = response.status_code
                last_payload = self._parse_payload(response)
                payload_error = self._extract_error(last_payload)

                if response.status_code in expected and not self._signals_error(last_payload):
                    return ToolResult(
                        success=True,
                        tool=resolved_path,
                        status="success",
                        status_code=response.status_code,
                        data=self._unwrap_payload(last_payload),
                        details={
                            "method": method.upper(),
                            "endpoint": resolved_path,
                            "payload": self.clean_data(last_payload),
                        },
                    )

                last_error = payload_error or f"backend_http_{response.status_code}"
                if response.status_code < 500:
                    break
            except httpx.HTTPError as exc:
                last_error = str(exc)
                logger.warning(
                    "Backend request failed method=%s endpoint=%s attempt=%s error=%s",
                    method.upper(),
                    resolved_path,
                    attempt,
                    exc,
                )

            if attempt < self.settings.backend_retry_attempts:
                await asyncio.sleep(self.settings.backend_retry_backoff_seconds * attempt)

        return ToolResult(
            success=False,
            tool=resolved_path,
            status="error",
            text=last_error or "backend_request_failed",
            error=last_error or "backend_request_failed",
            status_code=last_status,
            data=self._unwrap_payload(last_payload),
            details={
                "method": method.upper(),
                "endpoint": resolved_path,
                "payload": self.clean_data(last_payload),
            },
        )

    async def get(
        self,
        endpoint: str,
        *,
        access_token: str | None = None,
        expected_statuses: set[int] | None = None,
        params: dict[str, Any] | None = None,
    ) -> ToolResult:
        return await self.request(
            "GET",
            endpoint,
            access_token=access_token,
            expected_statuses=expected_statuses,
            params=params,
        )

    async def post(
        self,
        endpoint: str,
        *,
        access_token: str | None = None,
        expected_statuses: set[int] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> ToolResult:
        return await self.request(
            "POST",
            endpoint,
            access_token=access_token,
            expected_statuses=expected_statuses,
            json_body=json_body,
        )

    async def patch(
        self,
        endpoint: str,
        *,
        access_token: str | None = None,
        expected_statuses: set[int] | None = None,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> ToolResult:
        return await self.request(
            "PATCH",
            endpoint,
            access_token=access_token,
            expected_statuses=expected_statuses,
            json_body=json_body,
            params=params,
        )

    async def put(
        self,
        endpoint: str,
        *,
        access_token: str | None = None,
        expected_statuses: set[int] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> ToolResult:
        return await self.request(
            "PUT",
            endpoint,
            access_token=access_token,
            expected_statuses=expected_statuses,
            json_body=json_body,
        )

    async def get_binary(
        self,
        endpoint: str,
        *,
        access_token: str | None = None,
        expected_statuses: set[int] | None = None,
    ) -> BinaryResult:
        expected = expected_statuses or {200}
        resolved_path = endpoint if endpoint.startswith("/") else f"/{endpoint}"

        try:
            response = await self._client.get(
                resolved_path,
                headers=self._headers(access_token),
            )
            if response.status_code not in expected:
                return BinaryResult(
                    success=False,
                    tool=resolved_path,
                    error=response.text.strip() or f"backend_http_{response.status_code}",
                    status_code=response.status_code,
                    details={"endpoint": resolved_path, "method": "GET"},
                )
            disposition = response.headers.get("content-disposition", "")
            filename = self._extract_filename(disposition)
            return BinaryResult(
                success=True,
                tool=resolved_path,
                content=response.content,
                filename=filename,
                content_type=response.headers.get("content-type"),
                status_code=response.status_code,
                details={"endpoint": resolved_path, "method": "GET"},
            )
        except httpx.HTTPError as exc:
            return BinaryResult(
                success=False,
                tool=resolved_path,
                error=str(exc),
                details={"endpoint": resolved_path, "method": "GET"},
            )

    def _headers(self, access_token: str | None) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        token = access_token or self.settings.backend_auth_token
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def _parse_payload(self, response: httpx.Response) -> Any:
        content_type = response.headers.get("content-type", "").lower()
        if "application/json" in content_type:
            try:
                return response.json()
            except json.JSONDecodeError:
                return response.text.strip() or None
        return response.text.strip() or None

    def _signals_error(self, payload: Any) -> bool:
        return isinstance(payload, dict) and payload.get("success") is False

    def _unwrap_payload(self, payload: Any) -> Any:
        if isinstance(payload, dict) and "data" in payload:
            return payload.get("data")
        return payload

    def _extract_error(self, payload: Any) -> str | None:
        if isinstance(payload, dict):
            for key in ("message", "error"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            details = payload.get("details")
            if isinstance(details, dict):
                nested = details.get("message") or details.get("error")
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()
        if isinstance(payload, str) and payload.strip():
            return payload.strip()
        return None

    def _extract_filename(self, content_disposition: str) -> str | None:
        if not content_disposition:
            return None
        for fragment in content_disposition.split(";"):
            chunk = fragment.strip()
            if chunk.startswith("filename="):
                return chunk.split("=", 1)[1].strip().strip('"')
        return None

    def clean_data(self, payload: Any) -> Any:
        if isinstance(payload, dict):
            return {key: self.clean_data(value) for key, value in payload.items()}
        if isinstance(payload, list):
            return [self.clean_data(item) for item in payload]
        return payload
