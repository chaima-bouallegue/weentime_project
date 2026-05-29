from __future__ import annotations

import uuid
from time import perf_counter
from typing import Any

from app.context.current_user import CurrentUserContext
from app.observability.metrics import record_tool_event
from app.observability.request_context import get_request_id
from app.observability.tracing import log_event, start_span

from .audit import ToolAuditLogger
from .registry import ToolRegistry
from .result import ToolResult, build_read_result, build_write_result


class ToolExecutor:
    def __init__(
        self,
        registry: ToolRegistry,
        audit_logger: ToolAuditLogger | None = None,
        backend_client: Any | None = None,
    ) -> None:
        self.registry = registry
        self.audit_logger = audit_logger or ToolAuditLogger()
        self.backend_client = backend_client

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
        resolved_request_id = request_id or get_request_id() or str(context.metadata.get("request_id") or "") or None
        started = perf_counter()
        with start_span(
            "tool.request",
            {
                "tool_name": tool_name,
                "user_id": context.user_id,
                "tenant_id": context.tenant_id,
                "role": context.role,
                "confirmed": confirmed,
                "request_id": resolved_request_id,
            },
        ):
            log_event("tool.request", metadata={"tool_name": tool_name, "confirmed": confirmed, "request_id": resolved_request_id})
            try:
                registered = self.registry.get(tool_name)
            except KeyError:
                result = ToolResult.fail("tool_not_found", f"Tool unavailable: {tool_name}", status_code=404)
                self._log_tool_execution(tool_name, result, request_id=resolved_request_id, context=context, started=started)
                return result

            access_error = self.registry.validate_access(tool_name, context)
            if access_error:
                self.audit_logger.log(request_id=resolved_request_id, context=context, tool_name=tool_name, status="denied")
                log_event("tool.execute.denied", metadata={"tool_name": tool_name, "error_code": access_error.error_code})
                log_event("tool.error", metadata={"tool_name": tool_name, "error_code": access_error.error_code, "request_id": resolved_request_id})
                self._log_tool_execution(tool_name, access_error, status="denied", request_id=resolved_request_id, context=context, started=started)
                return access_error

            if registered.definition.type == "write" and registered.definition.requires_confirmation and not confirmed:
                result = ToolResult.fail("confirmation_required", "Cette action necessite une confirmation.", status_code=409)
                self._log_tool_execution(tool_name, result, request_id=resolved_request_id, context=context, started=started)
                return result

            try:
                model_input = self.registry.validate_input(tool_name, payload or {})
            except Exception as exc:
                result = ToolResult.fail("invalid_tool_input", str(exc), status_code=400)
                log_event("tool.error", metadata={"tool_name": tool_name, "error_code": result.error_code, "request_id": resolved_request_id})
                self._log_tool_execution(tool_name, result, request_id=resolved_request_id, context=context, started=started)
                return result

            if registered.definition.type == "write" and registered.definition.idempotency_required and not idempotency_key:
                idempotency_key = str(uuid.uuid4())

            preflight = await self._preflight_if_needed(tool_name, registered.definition.type, context)
            if preflight:
                self._log_tool_execution(tool_name, preflight, request_id=resolved_request_id, context=context, started=started)
                return preflight

            self.audit_logger.log(
                request_id=resolved_request_id,
                context=context,
                tool_name=tool_name,
                status="started",
                details={"idempotency_key": idempotency_key} if idempotency_key else None,
            )
            try:
                result = await registered.handler(model_input, context)
            except Exception as exc:
                self.audit_logger.log(request_id=resolved_request_id, context=context, tool_name=tool_name, status="failed")
                result = ToolResult.fail("tool_execution_failed", str(exc), status_code=500)
                log_event("tool.error", metadata={"tool_name": tool_name, "error_code": result.error_code, "request_id": resolved_request_id})
                self._log_tool_execution(tool_name, result, request_id=resolved_request_id, context=context, started=started)
                return result

            result = self._structured_failure_for_tool(tool_name, registered.definition.type, result)

            self.audit_logger.log(
                request_id=resolved_request_id,
                context=context,
                tool_name=tool_name,
                status="success" if result.success else "failed",
                details={"error_code": result.error_code} if result.error_code else None,
            )
            log_event(
                "tool.execute.finished",
                output={"success": result.success, "error_code": result.error_code, "status_code": result.status_code},
                metadata={"tool_name": tool_name, "request_id": resolved_request_id},
            )
            self._log_tool_execution(tool_name, result, request_id=resolved_request_id, context=context, started=started)
            return result

    @staticmethod
    def _log_tool_execution(
        tool_name: str,
        result: ToolResult,
        *,
        status: str | None = None,
        request_id: str | None = None,
        context: CurrentUserContext | None = None,
        started: float | None = None,
    ) -> None:
        resolved_status = status or ("success" if result.success else "failed")
        latency_ms = round((perf_counter() - started) * 1000, 2) if started is not None else None
        category = tool_name.split(".", 1)[0] if "." in tool_name else tool_name.split("_", 1)[0]
        record_tool_event(
            tool_name=tool_name,
            category=category,
            role=getattr(context, "role", None),
            tenant_id=getattr(context, "tenant_id", None),
            success=result.success,
            status=resolved_status,
            latency_ms=latency_ms,
        )
        error_code = result.error_code or ""
        business_error = error_code if result.status_code == 409 or "already" in error_code or "duplicate" in error_code else None
        log_event(
            "tool.result.normalized",
            metadata={
                "tool_name": tool_name,
                "status": resolved_status,
                "http_status": result.status_code,
                "business_error": business_error,
                "request_id": request_id,
                "latency_ms": latency_ms,
            },
        )

    async def _preflight_if_needed(
        self,
        tool_name: str,
        tool_type: str,
        context: CurrentUserContext,
    ) -> ToolResult | None:
        if (
            self.backend_client is None
            or not hasattr(self.backend_client, "preflight")
            or not self._requires_backend_preflight(tool_name)
        ):
            return None

        cache_key = "_backend_gateway_preflight"
        cached = context.metadata.get(cache_key)
        if isinstance(cached, ToolResult):
            result = cached
        else:
            result = await self.backend_client.preflight(context, tool_name=tool_name)
            context.metadata[cache_key] = result

        if result.success:
            return None
        return self._gateway_failure_for_tool(tool_name, tool_type, result)

    @staticmethod
    def _requires_backend_preflight(tool_name: str) -> bool:
        prefix = tool_name.split(".", 1)[0].lower()
        if tool_name in {
            "admin.provider_status",
            "admin.redis_status",
            "admin.braintrust_status",
            "admin.rag_status",
            "policy.search",
            "policy.get_source",
        }:
            return False
        if prefix in {
            "attendance",
            "leave",
            "document",
            "telework",
            "authorization",
            "rh",
            "communication",
            "organisation",
            "reunion",
            "schedule",
            "admin",
            "employee",
            "manager",
        }:
            return True
        return tool_name in {"get_pointage_status", "get_week_hours", "get_team_presence", "check_in", "check_out"}

    @staticmethod
    def _gateway_failure_for_tool(tool_name: str, tool_type: str, result: ToolResult) -> ToolResult:
        message = result.user_message or result.error_message or "Backend service unavailable."
        module = result.module or "backend"
        error = {"code": "backend_unavailable", "message": message, "module": module}
        if tool_type == "read":
            data = {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=message,
                    items=[],
                    count=0,
                    data={"module": module},
                    error=error,
                    backend_status=result.status_code,
                    empty=True,
                )
            }
        else:
            data = {
                "write_result": build_write_result(
                    tool_name=tool_name,
                    summary=message,
                    data={"module": module},
                    error=error,
                    backend_status=result.status_code,
                )
            }
        return ToolResult.fail(
            "backend_unavailable",
            message,
            status_code=result.status_code or 503,
            data=data,
            warnings=result.warnings,
            module=module,
            user_message=message,
        )

    @staticmethod
    def _structured_failure_for_tool(tool_name: str, tool_type: str, result: ToolResult) -> ToolResult:
        if result.success:
            return result

        code = str(result.error_code or "").lower()
        if code not in {"backend_unavailable", "backend_unreachable", "auth_required", "access_denied"}:
            return result

        existing = result.data if isinstance(result.data, dict) else {}
        if isinstance(existing.get("read_result"), dict) or isinstance(existing.get("write_result"), dict):
            return result

        message = result.user_message or result.error_message or "Tool request failed."
        module = result.module or (existing.get("module") if isinstance(existing.get("module"), str) else None) or "backend"
        error = {"code": code, "message": message, "module": module}
        if tool_type == "read":
            data = {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=message,
                    items=[],
                    count=0,
                    data={"module": module},
                    error=error,
                    backend_status=result.status_code,
                    empty=True,
                )
            }
        else:
            data = {
                "write_result": build_write_result(
                    tool_name=tool_name,
                    summary=message,
                    data={"module": module},
                    error=error,
                    backend_status=result.status_code,
                )
            }

        return ToolResult.fail(
            code,
            message,
            status_code=result.status_code,
            data=data,
            warnings=result.warnings,
            module=module,
            user_message=message,
        )
