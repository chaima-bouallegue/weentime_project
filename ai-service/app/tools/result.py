from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


def build_read_result(
    *,
    tool_name: str,
    summary: str,
    items: list[Any] | None = None,
    data: Any = None,
    error: dict[str, Any] | None = None,
    backend_status: int | None = None,
    empty: bool | None = None,
    count: int | None = None,
) -> dict[str, Any]:
    normalized_items = items or []
    normalized_count = len(normalized_items) if count is None else count
    return {
        "kind": "read_result",
        "toolName": tool_name,
        "summary": summary,
        "items": normalized_items,
        "empty": not normalized_items if empty is None else empty,
        "count": normalized_count,
        "data": data if data is not None else {},
        "error": error,
        "backendStatus": backend_status,
    }


def build_write_result(
    *,
    tool_name: str,
    summary: str,
    data: Any = None,
    error: dict[str, Any] | None = None,
    backend_status: int | None = None,
) -> dict[str, Any]:
    return {
        "kind": "write_result",
        "toolName": tool_name,
        "summary": summary,
        "data": data if data is not None else {},
        "error": error,
        "backendStatus": backend_status,
    }


def get_read_result(data: Any) -> dict[str, Any] | None:
    if isinstance(data, dict):
        read_result = data.get("read_result")
        if isinstance(read_result, dict) and read_result.get("kind") == "read_result":
            return read_result
        if data.get("kind") == "read_result":
            return data
    return None


class ToolResult(BaseModel):
    success: bool
    data: Any = None
    warnings: list[str] = Field(default_factory=list)
    error_code: str | None = None
    error_message: str | None = None
    status_code: int | None = None

    @classmethod
    def ok(cls, data: Any = None, *, warnings: list[str] | None = None, status_code: int | None = None) -> "ToolResult":
        return cls(success=True, data=data, warnings=warnings or [], status_code=status_code)

    @classmethod
    def fail(
        cls,
        code: str,
        message: str,
        *,
        status_code: int | None = None,
        data: Any = None,
        warnings: list[str] | None = None,
    ) -> "ToolResult":
        return cls(
            success=False,
            data=data,
            warnings=warnings or [],
            error_code=code,
            error_message=message,
            status_code=status_code,
        )
