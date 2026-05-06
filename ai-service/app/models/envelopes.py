from __future__ import annotations

from pydantic import BaseModel, Field


class ApiError(BaseModel):
    code: str
    message: str
    details: dict = Field(default_factory=dict)


class ApiEnvelope(BaseModel):
    success: bool
    data: dict | list | str | int | float | bool | None = None
    warnings: list[str] = Field(default_factory=list)
    error: ApiError | None = None

    @classmethod
    def ok(cls, data=None, warnings: list[str] | None = None) -> "ApiEnvelope":
        return cls(success=True, data=data, warnings=warnings or [], error=None)

    @classmethod
    def fail(cls, code: str, message: str, *, status_details: dict | None = None, warnings: list[str] | None = None) -> "ApiEnvelope":
        return cls(
            success=False,
            data=None,
            warnings=warnings or [],
            error=ApiError(code=code, message=message, details=status_details or {}),
        )
