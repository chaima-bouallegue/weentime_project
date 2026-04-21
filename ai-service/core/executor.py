from __future__ import annotations

import logging
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable
from uuid import uuid4

from config import Settings
from core.planner import plan_task
from core.response_generator import generate_response
from core.step_registry import STEP_MAP, StepOutcome
from core.validator import NON_RETRYABLE_ERRORS, should_retry_step, validate_execution
from memory.session import SessionStore, WorkflowState, WorkflowStepState
from tools.api_client import ToolResult
from tools.hr_tools import HRTools, SAFE_NOOP_STATUSES

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CacheEntry:
    expires_at: datetime
    result: ToolResult


@dataclass(slots=True)
class AutonomousExecutionResult:
    success: bool
    workflow_id: str
    workflow_name: str
    intent: str
    action: str | None
    status: str
    text: str
    steps: list[WorkflowStepState] = field(default_factory=list)
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    can_retry: bool = False
    action_executed: bool = False
    action_result: ToolResult | None = None
    actions: list[str] = field(default_factory=list)


class TaskExecutor:
    def __init__(self, settings: Settings, session_store: SessionStore, hr_tools: HRTools) -> None:
        self.settings = settings
        self.session_store = session_store
        self.hr_tools = hr_tools
        self._cache: dict[str, CacheEntry] = {}

    async def execute(
        self,
        *,
        intent: str,
        action: str | None,
        entities: dict[str, Any],
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
        resume: bool = False,
    ) -> AutonomousExecutionResult:
        resolved_intent = str(intent or "CHAT")
        resolved_role = (role or "EMPLOYEE").upper()
        context = dict(entities or {})
        plan = plan_task(resolved_intent, context, resolved_role)
        workflow_id = uuid4().hex
        workflow_name = f"autonomous_{resolved_intent.lower()}"

        if not plan:
            return AutonomousExecutionResult(
                success=True,
                workflow_id=workflow_id,
                workflow_name=workflow_name,
                intent=resolved_intent,
                action=action,
                status="success",
                text=str(context.get("message") or "Aucune execution requise."),
            )

        task_key = self._task_key(resolved_intent, context, resolved_role, plan)
        if self.session_store.is_task_pending(user_id, task_key):
            return AutonomousExecutionResult(
                success=False,
                workflow_id=workflow_id,
                workflow_name=workflow_name,
                intent=resolved_intent,
                action=action,
                status="failed",
                text="Une tache identique est deja en cours d'execution.",
                error="duplicate_task",
            )
        if self.session_store.task_attempts(user_id, task_key) >= self.settings.autonomous_max_task_attempts:
            return AutonomousExecutionResult(
                success=False,
                workflow_id=workflow_id,
                workflow_name=workflow_name,
                intent=resolved_intent,
                action=action,
                status="failed",
                text="Une boucle d'execution a ete detectee pour cette tache.",
                error="task_loop_detected",
            )

        existing_workflow = self.session_store.get_workflow(user_id) if resume else None
        if (
            existing_workflow is not None
            and existing_workflow.status == "failed"
            and existing_workflow.intent == resolved_intent
        ):
            workflow_id = existing_workflow.workflow_id

        self.session_store.set_last_plan(user_id, plan)
        self.session_store.start_task(
            user_id,
            task_id=workflow_id,
            task_key=task_key,
            intent=resolved_intent,
            role=resolved_role,
            plan=plan,
        )

        steps = [WorkflowStepState(key=str(item["step"]), label=str(item.get("label") or item["step"])) for item in plan]
        workflow_state = WorkflowState(
            workflow_id=workflow_id,
            workflow_name=workflow_name,
            intent=resolved_intent,
            action=action,
            status="running",
            entities=self._clean_json(context),
            context=self._clean_json(context),
            steps=steps,
            pending_step=steps[0].key if steps else None,
        )
        self.session_store.set_workflow(user_id, workflow_state)
        action_result: ToolResult | None = None
        action_executed = False
        final_error: str | None = None

        try:
            for index, plan_step in enumerate(plan):
                step_state = steps[index]
                step_state.status = "running"
                workflow_state.status = "running"
                workflow_state.pending_step = step_state.key
                workflow_state.error = None
                workflow_state.can_retry = False
                workflow_state.updated_at = datetime.utcnow()
                self.session_store.set_workflow(user_id, workflow_state)
                self.session_store.update_task_step(user_id, workflow_id, step_key=step_state.key, status="running")

                handler = STEP_MAP.get(step_state.key)
                if handler is None:
                    outcome = StepOutcome(
                        status="failed",
                        text=f"Etape inconnue: {step_state.key}.",
                        error="unknown_step",
                    )
                else:
                    outcome = await self._run_step_with_retry(
                        handler=handler,
                        step=plan_step,
                        context=context,
                        user_id=user_id,
                        access_token=access_token,
                        role=resolved_role,
                    )

                step_state.status = outcome.status
                step_state.text = outcome.text
                step_state.error = outcome.error
                step_state.data = self._clean_json(outcome.data)
                step_state.api = self._tool_api(outcome.tool_result)
                workflow_state.context = self._clean_json(
                    {
                        **context,
                        **self._clean_json(outcome.data),
                        **self._clean_json(outcome.context),
                    }
                )
                if step_state.status in {"success", "warning"} and step_state.key not in workflow_state.completed_steps:
                    workflow_state.completed_steps.append(step_state.key)
                workflow_state.error = step_state.error if step_state.status == "failed" else None
                workflow_state.updated_at = datetime.utcnow()
                self.session_store.update_task_step(
                    user_id,
                    workflow_id,
                    step_key=step_state.key,
                    status=step_state.status,
                    error=step_state.error,
                )

                if outcome.tool_result and self._is_primary_action_step(step_state.key):
                    action_result = outcome.tool_result
                    action_executed = self._tool_safe(outcome.tool_result)

                context.update(self._clean_json(outcome.data))
                context.update(self._clean_json(outcome.context))

                if outcome.status == "failed" and plan_step.get("critical", True):
                    final_error = outcome.error or "step_failed"
                    workflow_state.status = "failed"
                    workflow_state.pending_step = step_state.key
                    workflow_state.can_retry = final_error not in NON_RETRYABLE_ERRORS
                    workflow_state.updated_at = datetime.utcnow()
                    self.session_store.set_workflow(user_id, workflow_state)
                    break

                self.session_store.set_workflow(user_id, workflow_state)

            validation = validate_execution(steps)
            validation_payload = {
                "status": validation.status,
                "steps_completed": list(validation.steps_completed),
                "errors": list(validation.errors),
            }
            response_payload = generate_response(
                intent=resolved_intent,
                context=context,
                validation=validation_payload,
            )
            success = validation.status == "success"
            can_retry = bool(final_error) and final_error not in NON_RETRYABLE_ERRORS

            self.session_store.complete_task(
                user_id,
                workflow_id,
                status="success" if success else "failed",
                last_action=action,
            )
            workflow_state.status = "success" if success else "failed"
            workflow_state.pending_step = None if success else workflow_state.pending_step
            workflow_state.can_retry = can_retry
            workflow_state.error = final_error
            workflow_state.entities = self._clean_json(context)
            workflow_state.context = self._clean_json(context)
            workflow_state.updated_at = datetime.utcnow()
            self.session_store.set_workflow(user_id, workflow_state)

            return AutonomousExecutionResult(
                success=success,
                workflow_id=workflow_id,
                workflow_name=workflow_name,
                intent=resolved_intent,
                action=action,
                status=response_payload["status"],
                text=str(response_payload["text"]),
                steps=steps,
                data={
                    "plan": plan,
                    "context": self._clean_json(context),
                    "validation": validation_payload,
                    "actions": list(response_payload.get("actions") or []),
                },
                error=final_error,
                can_retry=can_retry,
                action_executed=action_executed,
                action_result=action_result,
                actions=list(response_payload.get("actions") or []),
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("autonomous execution crashed user_id=%s intent=%s", user_id, resolved_intent)
            self.session_store.complete_task(user_id, workflow_id, status="failed", last_action=action, error=str(exc))
            workflow_state.status = "failed"
            workflow_state.error = str(exc)
            workflow_state.can_retry = True
            workflow_state.updated_at = datetime.utcnow()
            self.session_store.set_workflow(user_id, workflow_state)
            return AutonomousExecutionResult(
                success=False,
                workflow_id=workflow_id,
                workflow_name=workflow_name,
                intent=resolved_intent,
                action=action,
                status="failed",
                text="Une erreur inattendue a interrompu l'execution autonome.",
                steps=steps,
                error=str(exc),
                can_retry=True,
                action_executed=action_executed,
                action_result=action_result,
            )

    async def _run_step_with_retry(
        self,
        *,
        handler: Callable[[TaskExecutor, dict[str, Any], dict[str, Any], int, str | None, str], Awaitable[StepOutcome]],
        step: dict[str, Any],
        context: dict[str, Any],
        user_id: int,
        access_token: str | None,
        role: str,
    ) -> StepOutcome:
        max_attempts = max(1, self.settings.executor_retry_attempts)
        last_outcome: StepOutcome | None = None

        for attempt in range(1, max_attempts + 1):
            outcome = await handler(self, step, context, user_id, access_token, role)
            last_outcome = outcome
            if should_retry_step(
                error=outcome.error,
                status=outcome.status,
                attempt=attempt,
                max_attempts=max_attempts,
            ):
                logger.warning(
                    "executor retry user_id=%s intent=%s step=%s attempt=%s error=%s",
                    user_id,
                    step.get("intent"),
                    step.get("step"),
                    attempt,
                    outcome.error,
                )
                continue
            return outcome

        return last_outcome or StepOutcome(status="failed", text="Etape echouee.", error="step_failed")

    async def execute_action(
        self,
        action: str,
        payload: dict[str, Any],
        *,
        user_id: int,
        access_token: str | None,
        role: str,
        cacheable: bool = False,
        cache_key: str | None = None,
    ) -> ToolResult:
        if cacheable and cache_key:
            cached = self._cache_get(cache_key)
            if cached is not None:
                return cached

        result = await self.hr_tools.execute_action(
            action,
            payload,
            user_id=user_id,
            access_token=access_token,
            role=role,
        )
        if cacheable and cache_key and result.success:
            self._cache_set(cache_key, result)
        return result

    async def cached_direct_call(
        self,
        *,
        cache_key: str,
        producer: Callable[[], Awaitable[ToolResult]],
    ) -> ToolResult:
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        result = await producer()
        if result.success:
            self._cache_set(cache_key, result)
        return result

    def action_outcome(
        self,
        result: ToolResult,
        *,
        success_text: str,
        failure_text: str,
        context_key: str,
        final_text: str,
    ) -> StepOutcome:
        if self._tool_safe(result):
            payload = result.data if isinstance(result.data, dict) else {}
            return StepOutcome(
                status="success",
                text=success_text,
                data={context_key: payload},
                context={context_key: payload, "final_text": final_text},
                tool_result=result,
            )
        return StepOutcome(
            status="failed",
            text=result.text or failure_text,
            error=result.error or result.status or "action_failed",
            tool_result=result,
            context={"fallback_text": result.text or failure_text},
        )

    def _tool_safe(self, result: ToolResult | None) -> bool:
        if result is None:
            return False
        return result.success or result.status in SAFE_NOOP_STATUSES

    def _tool_api(self, result: ToolResult | None) -> dict[str, Any]:
        if result is None:
            return {}
        details = result.details if isinstance(result.details, dict) else {}
        return self._clean_json(
            {
                "method": details.get("method"),
                "endpoint": details.get("endpoint"),
                "status": result.status,
            }
        )

    def _is_primary_action_step(self, step_key: str) -> bool:
        return step_key in {
            "create_leave",
            "create_authorization",
            "create_telework",
            "request_document",
            "open_document",
            "approve_request",
            "reject_request",
            "process_request",
        }

    def _task_key(self, intent: str, entities: dict[str, Any], role: str, plan: list[dict[str, Any]]) -> str:
        normalized_text = str(entities.get("normalized_text") or entities.get("raw_text") or "").strip()
        request_id = str(entities.get("request_id") or "")
        start_date = str(entities.get("start_date") or "")
        end_date = str(entities.get("end_date") or "")
        signature = ",".join(f"{item['intent']}:{item['step']}" for item in plan)
        return "|".join([intent, role, normalized_text, request_id, start_date, end_date, signature])

    def _cache_get(self, cache_key: str) -> ToolResult | None:
        entry = self._cache.get(cache_key)
        if entry is None:
            return None
        if datetime.utcnow() >= entry.expires_at:
            self._cache.pop(cache_key, None)
            return None
        return replace(entry.result)

    def _cache_set(self, cache_key: str, result: ToolResult) -> None:
        ttl = max(1, self.settings.executor_cache_ttl_seconds)
        self._cache[cache_key] = CacheEntry(
            expires_at=datetime.utcnow() + timedelta(seconds=ttl),
            result=replace(result),
        )

    def _clean_json(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {key: self._clean_json(item) for key, item in value.items() if item not in (None, "", [], {})}
        if isinstance(value, list):
            return [self._clean_json(item) for item in value if item not in (None, "", [], {})]
        return value
