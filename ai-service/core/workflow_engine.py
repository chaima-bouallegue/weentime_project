from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any
from uuid import uuid4

from config import Settings
from memory.session import SessionStore, WorkflowState, WorkflowStepState
from tools.api_client import ToolResult
from tools.hr_tools import HRTools, SAFE_NOOP_STATUSES


logger = logging.getLogger(__name__)

FINAL_REQUEST_STATUSES = {
    "APPROUVE",
    "APPROUVEE",
    "APPROVED",
    "REFUSE",
    "REFUSEE",
    "REJECTED",
    "ANNULE",
    "ANNULEE",
    "CANCELLED",
}

NON_RETRYABLE_ERRORS = {
    "already_exists",
    "already_processed",
    "insufficient_leave_balance",
    "invalid_date_range",
    "invalid_request_status",
    "missing_document_type",
    "missing_request_id",
    "request_not_found",
}


@dataclass(frozen=True)
class WorkflowStepDefinition:
    key: str
    label: str
    handler_name: str
    critical: bool = True


@dataclass
class WorkflowStepOutcome:
    status: str
    text: str
    error: str | None = None
    data: dict[str, Any] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)
    tool_result: ToolResult | None = None


@dataclass
class WorkflowExecutionResult:
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


WORKFLOW_DEFINITIONS: dict[str, tuple[WorkflowStepDefinition, ...]] = {
    "create_leave_workflow": (
        WorkflowStepDefinition("extract_dates", "Extraire les dates", "_step_extract_date_range"),
        WorkflowStepDefinition("validate_dates", "Valider les dates", "_step_validate_date_range"),
        WorkflowStepDefinition("check_leave_balance", "Verifier le solde", "_step_check_leave_balance"),
        WorkflowStepDefinition("create_leave", "Creer la demande", "_step_create_leave"),
        WorkflowStepDefinition("notify_manager", "Notifier le manager", "_step_notify_manager", critical=False),
        WorkflowStepDefinition("return_confirmation", "Retourner la confirmation", "_step_return_confirmation"),
    ),
    "create_authorization_workflow": (
        WorkflowStepDefinition("extract_schedule", "Extraire le creneau", "_step_extract_schedule"),
        WorkflowStepDefinition("validate_schedule", "Valider le creneau", "_step_validate_schedule"),
        WorkflowStepDefinition("create_authorization", "Creer l'autorisation", "_step_create_authorization"),
        WorkflowStepDefinition("notify_manager", "Notifier le manager", "_step_notify_manager", critical=False),
    ),
    "telework_workflow": (
        WorkflowStepDefinition("extract_dates", "Extraire les dates", "_step_extract_date_range"),
        WorkflowStepDefinition("validate_eligibility", "Verifier l'eligibilite", "_step_validate_telework_eligibility"),
        WorkflowStepDefinition("create_telework", "Creer la demande", "_step_create_telework"),
        WorkflowStepDefinition("notify_manager", "Notifier le manager", "_step_notify_manager", critical=False),
    ),
    "document_request_workflow": (
        WorkflowStepDefinition("identify_document_type", "Identifier le document", "_step_identify_document_type"),
        WorkflowStepDefinition("generate_document", "Demarrer la generation", "_step_generate_document"),
        WorkflowStepDefinition("store_document", "Verifier le stockage", "_step_store_document"),
        WorkflowStepDefinition("return_download_link", "Retourner le lien", "_step_return_download_link", critical=False),
    ),
    "approve_request_workflow": (
        WorkflowStepDefinition("fetch_request", "Recuperer la demande", "_step_fetch_request"),
        WorkflowStepDefinition("validate_status", "Verifier le statut", "_step_validate_request_status"),
        WorkflowStepDefinition("approve_request", "Approuver la demande", "_step_apply_request_decision"),
        WorkflowStepDefinition("notify_employee", "Notifier l'employe", "_step_notify_employee", critical=False),
        WorkflowStepDefinition("notify_rh", "Notifier les RH", "_step_notify_rh", critical=False),
        WorkflowStepDefinition("return_success", "Retourner le resultat", "_step_return_success"),
    ),
    "reject_request_workflow": (
        WorkflowStepDefinition("fetch_request", "Recuperer la demande", "_step_fetch_request"),
        WorkflowStepDefinition("validate_status", "Verifier le statut", "_step_validate_request_status"),
        WorkflowStepDefinition("reject_request", "Refuser la demande", "_step_apply_request_decision"),
        WorkflowStepDefinition("notify_employee", "Notifier l'employe", "_step_notify_employee", critical=False),
        WorkflowStepDefinition("notify_rh", "Notifier les RH", "_step_notify_rh", critical=False),
        WorkflowStepDefinition("return_success", "Retourner le resultat", "_step_return_success"),
    ),
    "process_request_workflow": (
        WorkflowStepDefinition("fetch_request", "Recuperer la demande", "_step_fetch_request"),
        WorkflowStepDefinition("validate_status", "Verifier le statut", "_step_validate_request_status"),
        WorkflowStepDefinition("process_request", "Traiter la demande", "_step_apply_request_decision"),
        WorkflowStepDefinition("notify_employee", "Notifier l'employe", "_step_notify_employee", critical=False),
        WorkflowStepDefinition("return_success", "Retourner le resultat", "_step_return_success"),
    ),
}


class WorkflowEngine:
    def __init__(self, settings: Settings, session_store: SessionStore, hr_tools: HRTools) -> None:
        self.settings = settings
        self.session_store = session_store
        self.hr_tools = hr_tools

    async def execute_workflow(
        self,
        *,
        workflow_name: str,
        intent: str,
        action: str | None,
        data: dict[str, Any],
        user_id: int,
        access_token: str | None = None,
        role: str = "EMPLOYEE",
        resume: bool = False,
    ) -> WorkflowExecutionResult:
        definitions = WORKFLOW_DEFINITIONS.get(workflow_name)
        if not definitions:
            return WorkflowExecutionResult(
                success=False,
                workflow_id=uuid4().hex,
                workflow_name=workflow_name,
                intent=intent,
                action=action,
                status="failed",
                text="Workflow introuvable.",
                error="workflow_not_found",
            )

        state = self._build_state(
            workflow_name=workflow_name,
            definitions=definitions,
            intent=intent,
            action=action,
            data=data,
            user_id=user_id,
            resume=resume,
        )
        context = dict(state.context)
        action_result: ToolResult | None = self._tool_result_from_context(context)
        start_index = self._start_index(state, definitions)

        logger.info(
            "workflow start user_id=%s role=%s workflow=%s intent=%s resume=%s",
            user_id,
            role,
            workflow_name,
            intent,
            resume,
        )

        for index in range(start_index, len(definitions)):
            definition = definitions[index]
            step = state.steps[index]
            step.status = "running"
            step.error = None
            step.text = ""
            step.data = {}
            step.api = {}
            state.status = "running"
            state.pending_step = definition.key
            state.updated_at = datetime.utcnow()
            self.session_store.set_workflow(user_id, state)

            logger.info("workflow step start user_id=%s workflow=%s step=%s", user_id, workflow_name, definition.key)
            handler = getattr(self, definition.handler_name)
            try:
                outcome = await handler(
                    intent=intent,
                    action=action,
                    context=context,
                    user_id=user_id,
                    access_token=access_token,
                    role=role,
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("workflow step crashed user_id=%s workflow=%s step=%s", user_id, workflow_name, definition.key)
                outcome = WorkflowStepOutcome(
                    status="failed",
                    text="Une erreur inattendue a interrompu le workflow.",
                    error=str(exc) or "workflow_step_failed",
                )

            context.update(self._compact(outcome.context))
            if outcome.tool_result:
                action_result = self._update_action_result(action_result, outcome.tool_result)

            step.status = outcome.status
            step.text = outcome.text
            step.error = outcome.error
            step.data = self._compact(outcome.data)
            step.api = self._api_from_tool_result(outcome.tool_result)
            state.context = dict(context)
            state.error = outcome.error if outcome.status == "failed" else None
            state.updated_at = datetime.utcnow()
            if outcome.status in {"success", "warning"} and definition.key not in state.completed_steps:
                state.completed_steps.append(definition.key)

            logger.info(
                "workflow step end user_id=%s workflow=%s step=%s status=%s",
                user_id,
                workflow_name,
                definition.key,
                outcome.status,
            )

            if outcome.status == "failed":
                state.status = "failed"
                state.pending_step = definition.key
                state.can_retry = self._can_retry(outcome.error)
                self.session_store.set_workflow(user_id, state)
                return WorkflowExecutionResult(
                    success=False,
                    workflow_id=state.workflow_id,
                    workflow_name=workflow_name,
                    intent=intent,
                    action=action,
                    status="failed",
                    text=outcome.text or self._failure_message(intent, definition.label),
                    steps=state.steps,
                    data=self._compact(context),
                    error=outcome.error,
                    can_retry=state.can_retry,
                    action_executed=action_result is not None and (action_result.success or action_result.status in SAFE_NOOP_STATUSES),
                    action_result=action_result,
                )

        state.status = "success"
        state.pending_step = None
        state.can_retry = False
        state.error = None
        state.context = dict(context)
        state.updated_at = datetime.utcnow()
        self.session_store.set_workflow(user_id, state)

        return WorkflowExecutionResult(
            success=True,
            workflow_id=state.workflow_id,
            workflow_name=workflow_name,
            intent=intent,
            action=action,
            status="success",
            text=str(context.get("final_text") or self._success_message(intent, context)),
            steps=state.steps,
            data=self._compact(context),
            can_retry=False,
            action_executed=action_result is not None and (action_result.success or action_result.status in SAFE_NOOP_STATUSES),
            action_result=action_result,
        )

    def _build_state(
        self,
        *,
        workflow_name: str,
        definitions: tuple[WorkflowStepDefinition, ...],
        intent: str,
        action: str | None,
        data: dict[str, Any],
        user_id: int,
        resume: bool,
    ) -> WorkflowState:
        existing = self.session_store.get_workflow(user_id)
        if resume and existing and existing.workflow_name == workflow_name and existing.status == "failed":
            existing.status = "running"
            existing.entities = self._compact({**existing.entities, **data})
            existing.context = self._compact({**existing.context, **data})
            existing.updated_at = datetime.utcnow()
            return existing

        return WorkflowState(
            workflow_id=uuid4().hex,
            workflow_name=workflow_name,
            intent=intent,
            action=action,
            status="running",
            entities=self._compact(data),
            context=self._compact(data),
            steps=[WorkflowStepState(key=item.key, label=item.label) for item in definitions],
            pending_step=definitions[0].key if definitions else None,
        )

    def _start_index(self, state: WorkflowState, definitions: tuple[WorkflowStepDefinition, ...]) -> int:
        for index, definition in enumerate(definitions):
            if index >= len(state.steps):
                return index
            if state.steps[index].status not in {"success", "warning"}:
                return index
            if definition.key not in state.completed_steps:
                state.completed_steps.append(definition.key)
        return len(definitions)

    def _tool_result_from_context(self, context: dict[str, Any]) -> ToolResult | None:
        value = context.get("action_result")
        return value if isinstance(value, ToolResult) else None

    def _update_action_result(self, current: ToolResult | None, candidate: ToolResult) -> ToolResult | None:
        action_tools = {
            "create_leave",
            "create_authorization",
            "create_telework",
            "request_document",
            "approve_request",
            "reject_request",
            "process_request",
            "/v1/conges",
            "/v1/autorisations",
            "/v1/teletravail",
            "/v1/documents",
        }
        if candidate.tool in action_tools:
            return candidate
        if "/v1/demandes/" in candidate.tool or "/v1/rh/demandes/" in candidate.tool:
            return candidate
        return current

    def _api_from_tool_result(self, result: ToolResult | None) -> dict[str, Any]:
        if result is None:
            return {}
        details = result.details if isinstance(result.details, dict) else {}
        return self._compact(
            {
                "method": details.get("method"),
                "endpoint": details.get("endpoint"),
                "status": result.status,
            }
        )

    def _can_retry(self, error: str | None) -> bool:
        return bool(error) and error not in NON_RETRYABLE_ERRORS

    def _compact(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: self._compact(item)
                for key, item in value.items()
                if item not in (None, "", [], {})
            }
        if isinstance(value, list):
            return [self._compact(item) for item in value if item not in (None, "", [], {})]
        return value

    async def _step_extract_date_range(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        start_date = context.get("start_date")
        end_date = context.get("end_date")
        if not start_date or not end_date:
            return WorkflowStepOutcome(
                status="failed",
                text="Les dates de debut et de fin sont requises.",
                error="missing_dates",
            )
        requested_days = self._days_between(start_date, end_date)
        if requested_days is None:
            return WorkflowStepOutcome(
                status="failed",
                text="Les dates fournies sont invalides.",
                error="invalid_date_range",
            )
        return WorkflowStepOutcome(
            status="success",
            text=f"Periode detectee du {start_date} au {end_date}.",
            data={"start_date": start_date, "end_date": end_date},
            context={"requested_days": requested_days},
        )

    async def _step_validate_date_range(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        requested_days = self._days_between(context.get("start_date"), context.get("end_date"))
        if requested_days is None or requested_days <= 0:
            return WorkflowStepOutcome(
                status="failed",
                text="La periode demandee est invalide.",
                error="invalid_date_range",
            )
        return WorkflowStepOutcome(
            status="success",
            text=f"Periode validee pour {requested_days} jour(s).",
            context={"requested_days": requested_days},
        )

    async def _step_check_leave_balance(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        result = await self.hr_tools.get_leave_balance(
            {},
            user_id=kwargs["user_id"],
            access_token=kwargs["access_token"],
            role=kwargs["role"],
        )
        if not result.success:
            return WorkflowStepOutcome(
                status="failed",
                text="Impossible de verifier votre solde de conges.",
                error=result.error or "leave_balance_failed",
                tool_result=result,
            )

        total = float((result.data or {}).get("total") or 0)
        requested_days = float(context.get("requested_days") or 0)
        if total < requested_days:
            return WorkflowStepOutcome(
                status="failed",
                text=f"Solde insuffisant: {total:.1f} jour(s) disponible(s) pour {requested_days:.1f} demande(s).",
                error="insufficient_leave_balance",
                tool_result=result,
                data={"leave_balance": result.data},
            )

        return WorkflowStepOutcome(
            status="success",
            text=f"Solde valide: {total:.1f} jour(s) disponible(s).",
            data={"leave_balance": result.data},
            context={"leave_balance": result.data},
            tool_result=result,
        )

    async def _step_create_leave(self, **kwargs: Any) -> WorkflowStepOutcome:
        return await self._execute_primary_action("create_leave", "leave_request", **kwargs)

    async def _step_extract_schedule(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        if not context.get("request_date") or not context.get("time_start") or not context.get("time_end"):
            return WorkflowStepOutcome(
                status="failed",
                text="La date et les heures de l'autorisation sont requises.",
                error="missing_authorization_schedule",
            )
        return WorkflowStepOutcome(
            status="success",
            text=(
                f"Creneau detecte le {context.get('request_date')}"
                f" de {context.get('time_start')} a {context.get('time_end')}."
            ),
        )

    async def _step_validate_schedule(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        time_start = str(context.get("time_start") or "")
        time_end = str(context.get("time_end") or "")
        if not time_start or not time_end or time_start >= time_end:
            return WorkflowStepOutcome(
                status="failed",
                text="Le creneau d'autorisation est invalide.",
                error="invalid_time_range",
            )
        return WorkflowStepOutcome(
            status="success",
            text="Creneau valide pour l'autorisation.",
        )

    async def _step_create_authorization(self, **kwargs: Any) -> WorkflowStepOutcome:
        return await self._execute_primary_action("create_authorization", "authorization_request", **kwargs)

    async def _step_validate_telework_eligibility(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        result = await self.hr_tools.get_my_telework_requests(access_token=kwargs["access_token"])
        if not result.success:
            return WorkflowStepOutcome(
                status="failed",
                text="Impossible de verifier l'eligibilite au teletravail.",
                error=result.error or "telework_eligibility_failed",
                tool_result=result,
            )

        start_date = str(context.get("start_date") or "")
        end_date = str(context.get("end_date") or "")
        for item in (result.data or {}).get("items", []):
            if not isinstance(item, dict):
                continue
            if self._status_is_final(item.get("statut")):
                continue
            item_start = item.get("dateDebut") or item.get("startDate")
            item_end = item.get("dateFin") or item.get("endDate") or item_start
            if str(item_start or "") == start_date and str(item_end or "") == end_date:
                return WorkflowStepOutcome(
                    status="failed",
                    text="Une demande de teletravail existe deja sur cette periode.",
                    error="already_exists",
                    tool_result=result,
                )

        return WorkflowStepOutcome(
            status="success",
            text="Eligibilite teletravail validee.",
            data={"existing_telework_requests": (result.data or {}).get("count", 0)},
            tool_result=result,
        )

    async def _step_create_telework(self, **kwargs: Any) -> WorkflowStepOutcome:
        return await self._execute_primary_action("create_telework", "telework_request", **kwargs)

    async def _step_identify_document_type(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        document_type = context.get("document_type")
        if not document_type:
            return WorkflowStepOutcome(
                status="failed",
                text="Le type de document est requis.",
                error="missing_document_type",
            )
        return WorkflowStepOutcome(
            status="success",
            text=f"Document identifie: {document_type}.",
        )

    async def _step_generate_document(self, **kwargs: Any) -> WorkflowStepOutcome:
        return await self._execute_primary_action("request_document", "document_request", **kwargs)

    async def _step_store_document(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        request_payload = context.get("document_request")
        request_id = self._extract_record_id(request_payload)
        if request_id is None:
            return WorkflowStepOutcome(
                status="failed",
                text="La demande de document a ete creee sans identifiant exploitable.",
                error="missing_document_request_id",
            )
        return WorkflowStepOutcome(
            status="success",
            text=f"Demande de document stockee sous l'identifiant {request_id}.",
            context={"document_request_id": request_id},
        )

    async def _step_return_download_link(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        request_id = context.get("document_request_id")
        if request_id is None:
            return WorkflowStepOutcome(
                status="warning",
                text="Le document a ete demande mais aucun lien n'est encore disponible.",
                error="missing_document_link",
                context={"final_text": "Votre demande de document a ete enregistree. Le lien sera disponible apres traitement RH."},
            )

        result = await self.hr_tools.open_document(
            {"request_id": request_id},
            user_id=kwargs["user_id"],
            access_token=kwargs["access_token"],
            role=kwargs["role"],
        )
        if not result.success:
            return WorkflowStepOutcome(
                status="warning",
                text="Le document n'est pas encore pret. La demande a ete enregistree.",
                error=result.error or "document_not_ready",
                tool_result=result,
                context={"final_text": "Votre demande de document a ete enregistree. Vous pourrez le telecharger des qu'il sera pret."},
            )

        download_url = (result.data or {}).get("download_url")
        return WorkflowStepOutcome(
            status="success",
            text="Le document est pret au telechargement.",
            data={"download_url": download_url},
            context={
                "download_url": download_url,
                "final_text": "Votre document est pret. Vous pouvez l'ouvrir directement depuis le chat.",
            },
            tool_result=result,
        )

    async def _step_fetch_request(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        result = await self.hr_tools.fetch_request(
            context,
            access_token=kwargs["access_token"],
            role=kwargs["role"],
        )
        if not result.success:
            return WorkflowStepOutcome(
                status="failed",
                text=result.text or "Impossible de retrouver la demande cible.",
                error=result.error or "request_not_found",
                tool_result=result,
            )
        return WorkflowStepOutcome(
            status="success",
            text=f"Demande {context.get('request_id')} chargee.",
            data={"request": result.data},
            context={"request_record": result.data},
            tool_result=result,
        )

    async def _step_validate_request_status(self, **kwargs: Any) -> WorkflowStepOutcome:
        record = kwargs["context"].get("request_record")
        if not isinstance(record, dict):
            return WorkflowStepOutcome(
                status="failed",
                text="La demande cible est introuvable.",
                error="request_not_found",
            )
        current_status = record.get("statut")
        if self._status_is_final(current_status):
            return WorkflowStepOutcome(
                status="failed",
                text="Cette demande a deja ete traitee.",
                error="already_processed",
                data={"current_status": current_status},
            )
        return WorkflowStepOutcome(
            status="success",
            text=f"Statut actuel valide: {current_status or 'EN_ATTENTE'}.",
            data={"current_status": current_status},
        )

    async def _step_apply_request_decision(self, **kwargs: Any) -> WorkflowStepOutcome:
        intent = kwargs["intent"]
        context = kwargs["context"]
        if intent == "APPROVE_REQUEST":
            result = await self.hr_tools.approve_request(
                context,
                user_id=kwargs["user_id"],
                access_token=kwargs["access_token"],
                role=kwargs["role"],
            )
        elif intent == "REJECT_REQUEST":
            result = await self.hr_tools.reject_request(
                context,
                user_id=kwargs["user_id"],
                access_token=kwargs["access_token"],
                role=kwargs["role"],
            )
        else:
            result = await self.hr_tools.process_request(
                context,
                user_id=kwargs["user_id"],
                access_token=kwargs["access_token"],
                role=kwargs["role"],
            )

        if not result.success and result.status not in SAFE_NOOP_STATUSES:
            return WorkflowStepOutcome(
                status="failed",
                text=result.text or "Le traitement de la demande a echoue.",
                error=result.error or result.status or "request_process_failed",
                tool_result=result,
            )

        record = result.data if isinstance(result.data, dict) else {}
        return WorkflowStepOutcome(
            status="success",
            text=result.text or "La demande a ete traitee.",
            data={"result": record},
            context={
                "decision_result": record,
                "final_text": result.text or self._success_message(intent, context),
            },
            tool_result=result,
        )

    async def _step_notify_manager(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        primary_record = self._primary_record(kwargs["intent"], context)
        manager_id = self._find_identifier(primary_record, ("managerId", "managerUserId", "responsableId"))
        title, message, action_url, notification_type = self._manager_notification(kwargs["intent"], context)

        if manager_id is not None:
            result = await self.hr_tools.notify_manager(
                manager_id,
                title=title,
                message=message,
                notification_type=notification_type,
                action_url=action_url,
                metadata={"intent": kwargs["intent"], "requestId": self._extract_record_id(primary_record)},
                access_token=kwargs["access_token"],
            )
        else:
            result = await self.hr_tools.notify_role(
                "ROLE_MANAGER",
                title=title,
                message=message,
                notification_type=notification_type,
                action_url=action_url,
                metadata={"intent": kwargs["intent"], "requestId": self._extract_record_id(primary_record)},
                access_token=kwargs["access_token"],
            )

        if not result.success:
            return WorkflowStepOutcome(
                status="warning",
                text="La demande a ete enregistree mais la notification manager n'a pas ete confirmee.",
                error=result.error or "manager_notification_failed",
                tool_result=result,
            )
        return WorkflowStepOutcome(
            status="success",
            text="Notification manager envoyee.",
            tool_result=result,
        )

    async def _step_notify_employee(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        request_record = context.get("request_record")
        decision_result = context.get("decision_result")
        employee_id = self._find_identifier(
            decision_result if isinstance(decision_result, dict) else None,
            ("employeId", "employeeId", "utilisateurId", "userId", "collaborateurId"),
        ) or self._find_identifier(
            request_record,
            ("employeId", "employeeId", "utilisateurId", "userId", "collaborateurId"),
        )
        if employee_id is None:
            return WorkflowStepOutcome(
                status="warning",
                text="La demande a ete traitee mais l'employe n'a pas pu etre notifie automatiquement.",
                error="missing_employee_id",
            )

        request_id = context.get("request_id")
        request_type = str(context.get("type_demande") or context.get("request_type") or "").lower() or "demande"
        verb = "approuvee" if kwargs["intent"] != "REJECT_REQUEST" and str(context.get("decision") or "").upper() != "REFUSE" else "refusee"
        result = await self.hr_tools.notify_user(
            employee_id,
            title="Mise a jour de votre demande RH",
            message=f"Votre demande {request_type} {request_id} a ete {verb}.",
            notification_type=self._request_notification_type(context),
            action_url="/app/employee/conges" if request_type == "conge" else "/app/employee/documents",
            metadata={"requestId": request_id, "requestType": request_type},
            access_token=kwargs["access_token"],
        )
        if not result.success:
            return WorkflowStepOutcome(
                status="warning",
                text="La demande a ete traitee mais la notification employe n'a pas ete confirmee.",
                error=result.error or "employee_notification_failed",
                tool_result=result,
            )
        return WorkflowStepOutcome(
            status="success",
            text="Notification employe envoyee.",
            tool_result=result,
        )

    async def _step_notify_rh(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        request_id = context.get("request_id")
        request_type = str(context.get("type_demande") or context.get("request_type") or "").lower() or "demande"
        decision_label = "approuvee" if kwargs["intent"] == "APPROVE_REQUEST" else "refusee"
        result = await self.hr_tools.notify_role(
            "ROLE_RH",
            title="Demande manager traitee",
            message=f"La demande {request_type} {request_id} a ete {decision_label} par le manager.",
            notification_type=self._request_notification_type(context),
            action_url="/app/rh/requests",
            metadata={"requestId": request_id, "requestType": request_type, "intent": kwargs["intent"]},
            access_token=kwargs["access_token"],
        )
        if not result.success:
            return WorkflowStepOutcome(
                status="warning",
                text="La demande a ete traitee mais la notification RH n'a pas ete confirmee.",
                error=result.error or "rh_notification_failed",
                tool_result=result,
            )
        return WorkflowStepOutcome(
            status="success",
            text="Notification RH envoyee.",
            tool_result=result,
        )

    async def _step_return_confirmation(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        record = context.get("leave_request")
        request_id = self._extract_record_id(record)
        text = (
            f"Votre demande de conge du {context.get('start_date')} au {context.get('end_date')}"
            f" a ete envoyee."
        )
        if request_id is not None:
            text = f"{text} Reference {request_id}."
        return WorkflowStepOutcome(
            status="success",
            text=text,
            context={"final_text": text},
        )

    async def _step_return_success(self, **kwargs: Any) -> WorkflowStepOutcome:
        context = kwargs["context"]
        request_id = context.get("request_id")
        request_type = str(context.get("type_demande") or context.get("request_type") or "").lower() or "demande"
        if kwargs["intent"] == "APPROVE_REQUEST":
            text = f"La demande {request_type} {request_id} a ete approuvee."
        elif kwargs["intent"] == "REJECT_REQUEST":
            text = f"La demande {request_type} {request_id} a ete refusee."
        else:
            decision = str(context.get("decision") or "").lower() or "mise a jour"
            text = f"La decision {decision} a ete appliquee a la demande {request_type} {request_id}."
        return WorkflowStepOutcome(
            status="success",
            text=text,
            context={"final_text": text},
        )

    async def _execute_primary_action(self, action_name: str, context_key: str, **kwargs: Any) -> WorkflowStepOutcome:
        result = await self.hr_tools.execute_action(
            action_name,
            kwargs["context"],
            user_id=kwargs["user_id"],
            access_token=kwargs["access_token"],
            role=kwargs["role"],
        )
        if not result.success and result.status not in SAFE_NOOP_STATUSES:
            return WorkflowStepOutcome(
                status="failed",
                text=result.text or "L'action principale a echoue.",
                error=result.error or result.status or "workflow_action_failed",
                tool_result=result,
            )

        payload = result.data if isinstance(result.data, dict) else {}
        final_text = result.text or self._success_message(kwargs["intent"], kwargs["context"])
        return WorkflowStepOutcome(
            status="success",
            text=final_text,
            data={context_key: payload},
            context={context_key: payload, "final_text": final_text},
            tool_result=result,
        )

    def _primary_record(self, intent: str, context: dict[str, Any]) -> dict[str, Any] | None:
        key_map = {
            "CREATE_LEAVE": "leave_request",
            "CREATE_AUTORISATION": "authorization_request",
            "CREATE_TELEWORK": "telework_request",
            "REQUEST_DOCUMENT": "document_request",
        }
        value = context.get(key_map.get(intent, ""))
        return value if isinstance(value, dict) else None

    def _success_message(self, intent: str, context: dict[str, Any]) -> str:
        if intent == "CREATE_LEAVE":
            return f"Votre demande de conge du {context.get('start_date')} au {context.get('end_date')} a ete envoyee."
        if intent == "CREATE_AUTORISATION":
            return f"Votre autorisation du {context.get('request_date')} a ete envoyee."
        if intent == "CREATE_TELEWORK":
            return f"Votre demande de teletravail du {context.get('start_date')} au {context.get('end_date')} a ete envoyee."
        if intent == "REQUEST_DOCUMENT":
            if context.get("download_url"):
                return "Votre document est pret au telechargement."
            return "Votre demande de document a ete enregistree."
        if intent in {"APPROVE_REQUEST", "REJECT_REQUEST", "PROCESS_REQUEST"}:
            return str(context.get("final_text") or "La demande a ete traitee.")
        return "Workflow termine."

    def _failure_message(self, intent: str, step_label: str) -> str:
        if intent == "CREATE_LEAVE":
            return f"Le workflow conge a echoue pendant l'etape {step_label.lower()}."
        if intent == "REQUEST_DOCUMENT":
            return f"Le workflow document a echoue pendant l'etape {step_label.lower()}."
        return f"Le workflow a echoue pendant l'etape {step_label.lower()}."

    def _status_is_final(self, value: Any) -> bool:
        return str(value or "").strip().upper() in FINAL_REQUEST_STATUSES

    def _days_between(self, start_date: Any, end_date: Any) -> int | None:
        try:
            start = date.fromisoformat(str(start_date))
            end = date.fromisoformat(str(end_date))
        except ValueError:
            return None
        delta = (end - start).days + 1
        return delta if delta > 0 else None

    def _extract_record_id(self, record: Any) -> int | str | None:
        if isinstance(record, dict):
            value = record.get("id") or record.get("requestId") or record.get("demandeId")
            return value if value not in (None, "") else None
        return None

    def _find_identifier(self, record: Any, keys: tuple[str, ...]) -> int | str | None:
        if not isinstance(record, dict):
            return None
        for key in keys:
            value = record.get(key)
            if value not in (None, ""):
                return value
        return None

    def _manager_notification(self, intent: str, context: dict[str, Any]) -> tuple[str, str, str, str]:
        request_id = self._extract_record_id(self._primary_record(intent, context))
        if intent == "CREATE_TELEWORK":
            return (
                "Nouvelle demande de teletravail",
                f"Une nouvelle demande de teletravail {request_id or ''} est en attente de validation.",
                "/app/manager/approbations",
                "TELEWORK",
            )
        if intent == "CREATE_AUTORISATION":
            return (
                "Nouvelle demande d'autorisation",
                f"Une nouvelle autorisation {request_id or ''} est en attente de validation.",
                "/app/manager/approbations",
                "PRESENCE",
            )
        return (
            "Nouvelle demande de conge",
            f"Une nouvelle demande de conge {request_id or ''} est en attente de validation.",
            "/app/manager/approbations",
            "LEAVE",
        )

    def _request_notification_type(self, context: dict[str, Any]) -> str:
        request_type = str(context.get("type_demande") or context.get("request_type") or "").upper()
        if request_type == "CONGE":
            return "LEAVE"
        if request_type == "TELETRAVAIL":
            return "TELEWORK"
        if request_type == "AUTORISATION":
            return "PRESENCE"
        return "SYSTEM"
