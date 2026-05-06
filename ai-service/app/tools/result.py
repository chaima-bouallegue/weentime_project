from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


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
