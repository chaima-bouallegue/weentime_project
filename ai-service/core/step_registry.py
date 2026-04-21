from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from core.action_map import role_can_execute
from tools.api_client import ToolResult
from tools.hr_tools import SAFE_NOOP_STATUSES

if TYPE_CHECKING:
    from core.executor import TaskExecutor


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


@dataclass(slots=True)
class StepOutcome:
    status: str
    text: str
    error: str | None = None
    data: dict[str, Any] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)
    tool_result: ToolResult | None = None


StepHandler = Callable[
    ["TaskExecutor", dict[str, Any], dict[str, Any], int, str | None, str],
    Awaitable[StepOutcome],
]


def _days_between(start_date: Any, end_date: Any) -> int | None:
    try:
        start = date.fromisoformat(str(start_date))
        end = date.fromisoformat(str(end_date))
    except ValueError:
        return None
    delta = (end - start).days + 1
    return delta if delta > 0 else None


def _extract_record_id(record: Any) -> int | str | None:
    if not isinstance(record, dict):
        return None
    value = record.get("id") or record.get("requestId") or record.get("demandeId")
    return value if value not in (None, "") else None


def _find_identifier(record: Any, keys: tuple[str, ...]) -> int | str | None:
    if not isinstance(record, dict):
        return None
    for key in keys:
        value = record.get(key)
        if value not in (None, ""):
            return value
    return None


def _request_type_label(context: dict[str, Any]) -> str:
    return str(context.get("type_demande") or context.get("request_type") or "demande").lower()


def _status_is_final(value: Any) -> bool:
    return str(value or "").strip().upper() in FINAL_REQUEST_STATUSES


async def check_permission_step(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, context, user_id, access_token)
    intent = str(step.get("intent") or "")
    if role_can_execute(intent, role):
        return StepOutcome(status="success", text="Permissions verifiees.")
    return StepOutcome(
        status="failed",
        text="Cette action n'est pas disponible pour votre role.",
        error="forbidden_for_role",
        context={"fallback_text": "Cette action n'est pas disponible pour votre role."},
    )


async def extract_dates_step(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, access_token, role)
    start_date = context.get("start_date")
    end_date = context.get("end_date")
    if not start_date or not end_date:
        return StepOutcome(status="failed", text="Les dates sont requises.", error="missing_dates")
    requested_days = _days_between(start_date, end_date)
    if requested_days is None:
        return StepOutcome(status="failed", text="La plage de dates est invalide.", error="invalid_date_range")
    return StepOutcome(
        status="success",
        text=f"Periode detectee du {start_date} au {end_date}.",
        context={"requested_days": requested_days},
    )


async def validate_dates_step(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, access_token, role)
    requested_days = _days_between(context.get("start_date"), context.get("end_date"))
    if requested_days is None:
        return StepOutcome(status="failed", text="Les dates sont invalides.", error="invalid_date_range")
    return StepOutcome(
        status="success",
        text=f"Periode validee pour {requested_days} jour(s).",
        context={"requested_days": requested_days},
    )


async def validate_schedule_step(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, access_token, role)
    request_date = context.get("request_date") or context.get("start_date")
    time_start = str(context.get("time_start") or "")
    time_end = str(context.get("time_end") or "")
    if not request_date or not time_start or not time_end:
        return StepOutcome(
            status="failed",
            text="La date et le creneau sont requis.",
            error="invalid_time_range",
        )
    if time_start >= time_end:
        return StepOutcome(
            status="failed",
            text="L'heure de fin doit etre posterieure a l'heure de debut.",
            error="invalid_time_range",
        )
    return StepOutcome(
        status="success",
        text=f"Creneau valide le {request_date} de {time_start} a {time_end}.",
    )


async def extract_schedule_step(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, access_token, role)
    request_date = context.get("request_date") or context.get("start_date")
    time_start = str(context.get("time_start") or "")
    time_end = str(context.get("time_end") or "")
    if not request_date or not time_start or not time_end:
        return StepOutcome(
            status="failed",
            text="La date et le creneau sont requis.",
            error="invalid_time_range",
        )
    return StepOutcome(
        status="success",
        text=f"Creneau detecte le {request_date} de {time_start} a {time_end}.",
    )


async def validate_telework_eligibility_step(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = step
    result = await executor.cached_direct_call(
        cache_key=f"telework:{user_id}",
        producer=lambda: executor.hr_tools.get_my_telework_requests(access_token=access_token),
    )
    if not result.success:
        return StepOutcome(
            status="failed",
            text="Impossible de verifier l'eligibilite teletravail.",
            error=result.error or "telework_eligibility_failed",
            tool_result=result,
        )

    items = ((result.data or {}).get("items") if isinstance(result.data, dict) else None) or []
    start_date = str(context.get("start_date") or "")
    end_date = str(context.get("end_date") or "")
    for item in items:
        if not isinstance(item, dict):
            continue
        item_start = str(item.get("dateDebut") or item.get("startDate") or "")
        item_end = str(item.get("dateFin") or item.get("endDate") or "")
        if item_start == start_date and item_end == end_date:
            return StepOutcome(
                status="failed",
                text="Une demande de teletravail existe deja sur cette periode.",
                error="already_exists",
                tool_result=result,
            )

    return StepOutcome(
        status="success",
        text="Eligibilite teletravail validee.",
        tool_result=result,
    )


async def check_leave_balance_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.cached_direct_call(
        cache_key=f"leave_balance:{user_id}:{role}",
        producer=lambda: executor.hr_tools.get_leave_balance(
            context,
            user_id=user_id,
            access_token=access_token,
            role=role,
        ),
    )
    if not result.success:
        return StepOutcome(
            status="failed",
            text=result.text or "Impossible de verifier le solde de conges.",
            error=result.error or "leave_balance_failed",
            tool_result=result,
        )

    payload = result.data if isinstance(result.data, dict) else {}
    total = float(payload.get("total") or 0.0)
    requested_days = _days_between(context.get("start_date"), context.get("end_date")) or int(context.get("requested_days") or 0)
    if requested_days > 0 and total < requested_days:
        return StepOutcome(
            status="failed",
            text=f"Solde insuffisant: {total:.1f} jour(s) disponible(s) pour {requested_days} demande(s).",
            error="insufficient_leave_balance",
            data={"leave_balance": payload},
            tool_result=result,
        )

    return StepOutcome(
        status="success",
        text=result.text or f"Solde valide: {total:.1f} jour(s) disponible(s).",
        data={"leave_balance": payload},
        context={
            "leave_balance": payload,
            "leave_balance_text": result.text,
        },
        tool_result=result,
    )


async def identify_document_type_step(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, access_token, role)
    document_type = context.get("document_type")
    if not document_type:
        return StepOutcome(
            status="failed",
            text="Le type de document est requis.",
            error="missing_document_type",
        )
    return StepOutcome(status="success", text=f"Document identifie: {document_type}.")


async def fetch_request_step(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (step, user_id)
    result = await executor.hr_tools.fetch_request(context, access_token=access_token, role=role)
    if not result.success:
        return StepOutcome(
            status="failed",
            text=result.text or "Impossible de recuperer la demande.",
            error=result.error or "request_not_found",
            tool_result=result,
        )
    return StepOutcome(
        status="success",
        text=result.text or "Demande chargee.",
        data={"request": result.data if isinstance(result.data, dict) else {}},
        context={"request_record": result.data if isinstance(result.data, dict) else {}},
        tool_result=result,
    )


async def validate_status_step(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, access_token, role)
    request_record = context.get("request_record")
    if not isinstance(request_record, dict):
        return StepOutcome(status="failed", text="La demande cible est introuvable.", error="request_not_found")
    current_status = request_record.get("statut")
    if _status_is_final(current_status):
        return StepOutcome(status="failed", text="Cette demande a deja ete traitee.", error="already_processed")
    return StepOutcome(status="success", text=f"Statut actuel valide: {current_status or 'EN_ATTENTE'}.")


async def create_leave_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action("create_leave", context, user_id=user_id, access_token=access_token, role=role)
    return executor.action_outcome(
        result,
        success_text=result.text or "Votre demande de conge a ete creee.",
        failure_text="La creation du conge a echoue.",
        context_key="leave_request",
        final_text=result.text or "Votre conge a ete cree et votre manager a ete notifie.",
    )


async def create_authorization_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action("create_authorization", context, user_id=user_id, access_token=access_token, role=role)
    return executor.action_outcome(
        result,
        success_text=result.text or "Votre demande d'autorisation a ete creee.",
        failure_text="La creation de l'autorisation a echoue.",
        context_key="authorization_request",
        final_text=result.text or "Votre autorisation a ete creee et votre manager a ete notifie.",
    )


async def create_telework_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action("create_telework", context, user_id=user_id, access_token=access_token, role=role)
    return executor.action_outcome(
        result,
        success_text=result.text or "Votre demande de teletravail a ete creee.",
        failure_text="La creation du teletravail a echoue.",
        context_key="telework_request",
        final_text=result.text or "Votre demande de teletravail a ete creee et votre manager a ete notifie.",
    )


async def request_document_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action("request_document", context, user_id=user_id, access_token=access_token, role=role)
    return executor.action_outcome(
        result,
        success_text=result.text or "Votre demande de document a ete creee.",
        failure_text="La demande de document a echoue.",
        context_key="document_request",
        final_text=result.text or "Votre demande de document a ete creee.",
    )


async def store_document_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, access_token, role)
    request_payload = context.get("document_request")
    request_id = _extract_record_id(request_payload)
    if request_id is None:
        return StepOutcome(
            status="failed",
            text="La demande de document a ete creee sans identifiant exploitable.",
            error="missing_document_request_id",
        )
    return StepOutcome(
        status="success",
        text=f"Demande de document stockee sous l'identifiant {request_id}.",
        context={"document_request_id": request_id, "request_id": request_id},
    )


async def return_download_link_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    request_id = context.get("document_request_id") or context.get("request_id")
    if request_id in (None, ""):
        return StepOutcome(
            status="warning",
            text="Le document a ete demande mais aucun lien n'est encore disponible.",
            error="missing_document_link",
            context={"final_text": "Votre demande de document a ete enregistree. Le lien sera disponible apres traitement RH."},
        )

    result = await executor.hr_tools.open_document(
        {**context, "request_id": request_id},
        user_id=user_id,
        access_token=access_token,
        role=role,
    )
    if not result.success:
        return StepOutcome(
            status="warning",
            text="Le document n'est pas encore pret. La demande a ete enregistree.",
            error=result.error or "document_not_ready",
            tool_result=result,
            context={"final_text": "Votre demande de document a ete enregistree. Vous pourrez le telecharger des qu'il sera pret."},
        )

    payload = result.data if isinstance(result.data, dict) else {}
    download_url = payload.get("download_url")
    return StepOutcome(
        status="success",
        text="Le document est pret au telechargement.",
        data={"download_url": download_url},
        context={
            "download_url": download_url,
            "final_text": "Votre document est pret. Vous pouvez l'ouvrir directement depuis le chat.",
        },
        tool_result=result,
    )


async def open_document_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action("open_document", context, user_id=user_id, access_token=access_token, role=role)
    return executor.action_outcome(
        result,
        success_text=result.text or "Le document est disponible.",
        failure_text="Impossible d'ouvrir le document.",
        context_key="document_payload",
        final_text=result.text or "Le document a ete ouvert.",
    )


async def approve_request_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action("approve_request", context, user_id=user_id, access_token=access_token, role=role)
    return executor.action_outcome(
        result,
        success_text=result.text or "La demande a ete approuvee.",
        failure_text="L'approbation a echoue.",
        context_key="decision_result",
        final_text=result.text or "La demande a ete approuvee et l'employe a ete notifie.",
    )


async def reject_request_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action("reject_request", context, user_id=user_id, access_token=access_token, role=role)
    return executor.action_outcome(
        result,
        success_text=result.text or "La demande a ete refusee.",
        failure_text="Le refus a echoue.",
        context_key="decision_result",
        final_text=result.text or "La demande a ete refusee et l'employe a ete notifie.",
    )


async def process_request_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action("process_request", context, user_id=user_id, access_token=access_token, role=role)
    return executor.action_outcome(
        result,
        success_text=result.text or "La demande RH a ete traitee.",
        failure_text="Le traitement RH a echoue.",
        context_key="decision_result",
        final_text=result.text or "La demande RH a ete traitee et l'employe a ete notifie.",
    )


async def return_confirmation_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, access_token, role)
    request_record = context.get("leave_request") or context.get("authorization_request") or context.get("telework_request")
    request_id = _extract_record_id(request_record)
    if context.get("start_date") and context.get("end_date"):
        text = f"Votre demande du {context.get('start_date')} au {context.get('end_date')} a ete envoyee."
    elif context.get("request_date"):
        text = f"Votre demande du {context.get('request_date')} a ete envoyee."
    else:
        text = "Votre demande a ete envoyee."
    if request_id is not None:
        text = f"{text} Reference {request_id}."
    return StepOutcome(status="success", text=text, context={"final_text": text})


async def return_success_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, access_token, role)
    request_id = context.get("request_id")
    request_type = _request_type_label(context)
    if str(step.get("intent") or "").upper() == "APPROVE_REQUEST":
        text = f"La demande {request_type} {request_id} a ete approuvee."
    elif str(step.get("intent") or "").upper() == "REJECT_REQUEST":
        text = f"La demande {request_type} {request_id} a ete refusee."
    else:
        decision = str(context.get("decision") or "").strip().lower() or "mise a jour"
        text = f"La decision {decision} a ete appliquee a la demande {request_type} {request_id}."
    return StepOutcome(status="success", text=text, context={"final_text": text})


async def notify_manager_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, role)
    primary_record = (
        context.get("leave_request")
        or context.get("authorization_request")
        or context.get("telework_request")
        or context.get("document_request")
    )
    request_id = _extract_record_id(primary_record)
    manager_id = _find_identifier(primary_record, ("managerId", "managerUserId", "responsableId"))
    title = "Nouvelle demande RH"
    message = f"Une nouvelle demande {request_id or ''} est en attente de validation.".strip()
    metadata = {"requestId": request_id, "intent": step.get("intent")}
    if manager_id is not None:
        result = await executor.hr_tools.notify_manager(
            manager_id,
            title=title,
            message=message,
            notification_type="SYSTEM",
            action_url="/app/manager/approbations",
            metadata=metadata,
            access_token=access_token,
        )
    else:
        result = await executor.hr_tools.notify_role(
            "ROLE_MANAGER",
            title=title,
            message=message,
            notification_type="SYSTEM",
            action_url="/app/manager/approbations",
            metadata=metadata,
            access_token=access_token,
        )
    if result.success:
        return StepOutcome(status="success", text="Notification manager envoyee.", tool_result=result)
    return StepOutcome(
        status="warning",
        text="La demande a ete creee mais la notification manager n'a pas ete confirmee.",
        error=result.error or "manager_notification_failed",
        tool_result=result,
    )


async def notify_employee_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, role)
    request_record = context.get("request_record")
    decision_result = context.get("decision_result")
    employee_id = _find_identifier(
        decision_result if isinstance(decision_result, dict) else None,
        ("employeId", "employeeId", "utilisateurId", "userId", "collaborateurId"),
    ) or _find_identifier(
        request_record,
        ("employeId", "employeeId", "utilisateurId", "userId", "collaborateurId"),
    )
    if employee_id is None:
        return StepOutcome(
            status="warning",
            text="La demande a ete traitee mais l'employe n'a pas pu etre notifie automatiquement.",
            error="missing_employee_id",
        )

    request_id = context.get("request_id")
    request_type = _request_type_label(context)
    is_rejection = str(step.get("step") or "").startswith("reject") or str(context.get("decision") or "").upper() == "REFUSE"
    verb = "refusee" if is_rejection else "approuvee"
    result = await executor.hr_tools.notify_user(
        employee_id,
        title="Mise a jour de votre demande RH",
        message=f"Votre demande {request_type} {request_id} a ete {verb}.",
        notification_type="SYSTEM",
        action_url="/app/employee/conges",
        metadata={"requestId": request_id, "requestType": request_type},
        access_token=access_token,
    )
    if result.success:
        return StepOutcome(status="success", text="Notification employe envoyee.", tool_result=result)
    return StepOutcome(
        status="warning",
        text="La demande a ete traitee mais la notification employe n'a pas ete confirmee.",
        error=result.error or "employee_notification_failed",
        tool_result=result,
    )


async def notify_rh_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    _ = (executor, step, user_id, role)
    request_id = context.get("request_id")
    request_type = _request_type_label(context)
    result = await executor.hr_tools.notify_role(
        "ROLE_RH",
        title="Demande manager traitee",
        message=f"La demande {request_type} {request_id} a ete traitee par le manager.",
        notification_type="SYSTEM",
        action_url="/app/rh/requests",
        metadata={"requestId": request_id, "requestType": request_type},
        access_token=access_token,
    )
    if result.success:
        return StepOutcome(status="success", text="Notification RH envoyee.", tool_result=result)
    return StepOutcome(
        status="warning",
        text="La demande a ete traitee mais la notification RH n'a pas ete confirmee.",
        error=result.error or "rh_notification_failed",
        tool_result=result,
    )


async def get_leave_balance_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.cached_direct_call(
        cache_key=f"leave_balance:{user_id}:{role}",
        producer=lambda: executor.hr_tools.get_leave_balance(
            context,
            user_id=user_id,
            access_token=access_token,
            role=role,
        ),
    )
    if not result.success:
        return StepOutcome(status="failed", text=result.text or "Impossible de recuperer le solde.", error=result.error, tool_result=result)
    return StepOutcome(
        status="success",
        text=result.text or "Solde de conges recupere.",
        data={"leave_balance": result.data if isinstance(result.data, dict) else {}},
        context={
            "leave_balance": result.data if isinstance(result.data, dict) else {},
            "leave_balance_text": result.text,
            "final_text": result.text,
        },
        tool_result=result,
    )


async def get_notifications_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action(
        "get_notifications",
        context,
        user_id=user_id,
        access_token=access_token,
        role=role,
        cacheable=True,
        cache_key=f"notifications:{user_id}:{role}",
    )
    if not result.success:
        return StepOutcome(status="failed", text=result.text or "Impossible de recuperer les notifications.", error=result.error, tool_result=result)
    return StepOutcome(
        status="success",
        text=result.text or "Notifications recuperees.",
        data={"notifications": result.data if isinstance(result.data, dict) else {}},
        context={"notifications_text": result.text, "final_text": result.text},
        tool_result=result,
    )


async def get_my_requests_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action(
        "get_my_requests",
        context,
        user_id=user_id,
        access_token=access_token,
        role=role,
        cacheable=True,
        cache_key=f"my_requests:{user_id}",
    )
    if not result.success:
        return StepOutcome(status="failed", text=result.text or "Impossible de recuperer vos demandes.", error=result.error, tool_result=result)
    return StepOutcome(
        status="success",
        text=result.text or "Demandes recuperees.",
        data={"requests": result.data if isinstance(result.data, dict) else {}},
        context={"requests_text": result.text, "final_text": result.text},
        tool_result=result,
    )


async def get_team_requests_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action(
        "get_team_requests",
        context,
        user_id=user_id,
        access_token=access_token,
        role=role,
        cacheable=True,
        cache_key=f"team_requests:{user_id}:{role}",
    )
    if not result.success:
        return StepOutcome(status="failed", text=result.text or "Impossible de recuperer les demandes equipe.", error=result.error, tool_result=result)
    return StepOutcome(
        status="success",
        text=result.text or "Demandes equipe recuperees.",
        data={"team_requests": result.data if isinstance(result.data, dict) else {}},
        context={"team_requests_text": result.text, "final_text": result.text},
        tool_result=result,
    )


async def get_pending_validations_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action(
        "get_pending_validations",
        context,
        user_id=user_id,
        access_token=access_token,
        role=role,
        cacheable=True,
        cache_key=f"pending_validations:{user_id}:{role}",
    )
    if not result.success:
        return StepOutcome(status="failed", text=result.text or "Impossible de recuperer les validations en attente.", error=result.error, tool_result=result)
    return StepOutcome(
        status="success",
        text=result.text or "Validations recuperees.",
        data={"pending_validations": result.data if isinstance(result.data, dict) else {}},
        context={"pending_validations_text": result.text, "final_text": result.text},
        tool_result=result,
    )


async def get_rh_stats_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action(
        "get_rh_stats",
        context,
        user_id=user_id,
        access_token=access_token,
        role=role,
        cacheable=True,
        cache_key=f"rh_stats:{role}",
    )
    if not result.success:
        return StepOutcome(status="failed", text=result.text or "Impossible de recuperer les statistiques RH.", error=result.error, tool_result=result)
    return StepOutcome(
        status="success",
        text=result.text or "Statistiques RH recuperees.",
        data={"rh_stats": result.data if isinstance(result.data, dict) else {}},
        context={"final_text": result.text or "Les statistiques RH sont disponibles."},
        tool_result=result,
    )


async def get_all_requests_api(
    executor: TaskExecutor,
    step: dict[str, Any],
    context: dict[str, Any],
    user_id: int,
    access_token: str | None,
    role: str,
) -> StepOutcome:
    result = await executor.execute_action(
        "get_all_requests",
        context,
        user_id=user_id,
        access_token=access_token,
        role=role,
        cacheable=True,
        cache_key=f"all_requests:{role}:{context.get('type_demande') or ''}",
    )
    if not result.success:
        return StepOutcome(status="failed", text=result.text or "Impossible de recuperer les demandes RH.", error=result.error, tool_result=result)
    return StepOutcome(
        status="success",
        text=result.text or "Demandes RH recuperees.",
        data={"all_requests": result.data if isinstance(result.data, dict) else {}},
        context={"final_text": result.text or "Les demandes RH ont ete chargees."},
        tool_result=result,
    )


STEP_MAP: dict[str, StepHandler] = {
    "check_permission": check_permission_step,
    "extract_dates": extract_dates_step,
    "extract_schedule": extract_schedule_step,
    "validate_dates": validate_dates_step,
    "check_leave_balance": check_leave_balance_api,
    "validate_schedule": validate_schedule_step,
    "validate_eligibility": validate_telework_eligibility_step,
    "validate_telework_eligibility": validate_telework_eligibility_step,
    "identify_document_type": identify_document_type_step,
    "fetch_request": fetch_request_step,
    "validate_status": validate_status_step,
    "create_leave": create_leave_api,
    "create_authorization": create_authorization_api,
    "create_telework": create_telework_api,
    "generate_document": request_document_api,
    "request_document": request_document_api,
    "store_document": store_document_api,
    "return_download_link": return_download_link_api,
    "open_document": open_document_api,
    "approve_request": approve_request_api,
    "reject_request": reject_request_api,
    "process_request": process_request_api,
    "notify_manager": notify_manager_api,
    "notify_employee": notify_employee_api,
    "notify_rh": notify_rh_api,
    "return_confirmation": return_confirmation_api,
    "return_success": return_success_api,
    "get_leave_balance": get_leave_balance_api,
    "get_notifications": get_notifications_api,
    "get_my_requests": get_my_requests_api,
    "get_team_requests": get_team_requests_api,
    "get_pending_validations": get_pending_validations_api,
    "get_rh_stats": get_rh_stats_api,
    "get_all_requests": get_all_requests_api,
}
