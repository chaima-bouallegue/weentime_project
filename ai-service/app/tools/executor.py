from __future__ import annotations

import uuid
from typing import Any

from app.context.current_user import CurrentUserContext
from app.observability.tracing import log_event, start_span

from .audit import ToolAuditLogger
from .registry import ToolRegistry
from .result import ToolResult


class ToolExecutor:
    def __init__(self, registry: ToolRegistry, audit_logger: ToolAuditLogger | None = None) -> None:
        self.registry = registry
        self.audit_logger = audit_logger or ToolAuditLogger()

    async def execute(
        self,
        tool_name: str,
        payload: dict[str, Any] | None,
        context: CurrentUserContext,
        *,
        confirmed: bool = False,
        request_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> ToolResult:
        with start_span(
            "tool.execution",
            {
                "tool_name": tool_name,
                "user_id": context.user_id,
                "tenant_id": context.tenant_id,
                "role": context.role,
                "confirmed": confirmed,
            },
        ):
            try:
                registered = self.registry.get(tool_name)
            except KeyError:
                result = ToolResult.fail("tool_not_found", f"Tool unavailable: {tool_name}", status_code=404)
                self._log_tool_execution(tool_name, result)
                return result

            access_error = self.registry.validate_access(tool_name, context)
            if access_error:
                self.audit_logger.log(request_id=request_id, context=context, tool_name=tool_name, status="denied")
                log_event("tool.execute.denied", metadata={"tool_name": tool_name, "error_code": access_error.error_code})
                self._log_tool_execution(tool_name, access_error, status="denied")
                return access_error

            if registered.definition.type == "write" and registered.definition.requires_confirmation and not confirmed:
                result = ToolResult.fail("confirmation_required", "Cette action necessite une confirmation.", status_code=409)
                self._log_tool_execution(tool_name, result)
                return result

            try:
                model_input = self.registry.validate_input(tool_name, payload or {})
            except Exception as exc:
                result = ToolResult.fail("invalid_tool_input", str(exc), status_code=400)
                self._log_tool_execution(tool_name, result)
                return result

            if registered.definition.type == "write" and registered.definition.idempotency_required and not idempotency_key:
                idempotency_key = str(uuid.uuid4())

            self.audit_logger.log(
                request_id=request_id,
                context=context,
                tool_name=tool_name,
                status="started",
                details={"idempotency_key": idempotency_key} if idempotency_key else None,
            )
            try:
                result = await registered.handler(model_input, context)
            except Exception as exc:
                self.audit_logger.log(request_id=request_id, context=context, tool_name=tool_name, status="failed")
                result = ToolResult.fail("tool_execution_failed", str(exc), status_code=500)
                self._log_tool_execution(tool_name, result)
                return result

            self.audit_logger.log(
                request_id=request_id,
                context=context,
                tool_name=tool_name,
                status="success" if result.success else "failed",
                details={"error_code": result.error_code} if result.error_code else None,
            )
            log_event(
                "tool.execute.finished",
                output={"success": result.success, "error_code": result.error_code, "status_code": result.status_code},
                metadata={"tool_name": tool_name},
            )
            self._log_tool_execution(tool_name, result)
            return result

    @staticmethod
    def _log_tool_execution(tool_name: str, result: ToolResult, *, status: str | None = None) -> None:
        error_code = result.error_code or ""
        business_error = error_code if result.status_code == 409 or "already" in error_code or "duplicate" in error_code else None
        log_event(
            "tool.execution",
            metadata={
                "tool_name": tool_name,
                "status": status or ("success" if result.success else "failed"),
                "http_status": result.status_code,
                "business_error": business_error,
            },
        )
