from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from tools.hr_tools import SAFE_NOOP_STATUSES

NON_RETRYABLE_ERRORS = {
    "already_exists",
    "already_processed",
    "forbidden_for_role",
    "insufficient_leave_balance",
    "invalid_date_range",
    "invalid_time_range",
    "missing_dates",
    "missing_document_type",
    "missing_request_id",
    "request_not_found",
    "task_loop_detected",
}


@dataclass(slots=True)
class ValidationResult:
    status: str
    steps_completed: list[str] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)


def should_retry_step(*, error: str | None, status: str, attempt: int, max_attempts: int) -> bool:
    normalized_error = str(error or "").strip().lower()
    normalized_status = str(status or "").strip().lower()

    if attempt >= max_attempts:
        return False
    if normalized_status in {"success", "warning"}:
        return False
    if normalized_status in SAFE_NOOP_STATUSES:
        return False
    if normalized_error in NON_RETRYABLE_ERRORS:
        return False
    return True


def validate_execution(steps: list[Any]) -> ValidationResult:
    completed: list[str] = []
    errors: list[dict[str, Any]] = []

    for step in steps:
        status = str(getattr(step, "status", "pending"))
        if status in {"success", "warning"}:
            completed.append(str(getattr(step, "key", "")))
            continue
        if status == "failed":
            errors.append(
                {
                    "step": str(getattr(step, "key", "")),
                    "error": getattr(step, "error", None),
                    "text": getattr(step, "text", ""),
                }
            )

    return ValidationResult(
        status="failed" if errors else "success",
        steps_completed=completed,
        errors=errors,
    )
