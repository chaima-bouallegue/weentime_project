from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


RoleName = Literal["EMPLOYEE", "MANAGER", "RH", "ADMIN"]
ActionKind = Literal["query", "mutation", "navigation"]


@dataclass(frozen=True)
class BackendEndpoint:
    method: str
    path: str
    description: str = ""


@dataclass(frozen=True)
class ActionDefinition:
    intent: str
    action: str
    kind: ActionKind
    roles: tuple[RoleName, ...]
    workflow: str | None = None
    workflow_steps: tuple[str, ...] = ()
    required_fields: tuple[str, ...] = ()
    endpoints: tuple[BackendEndpoint, ...] = ()


ACTION_MAP: dict[str, ActionDefinition] = {
    "GET_LEAVE_BALANCE": ActionDefinition(
        intent="GET_LEAVE_BALANCE",
        action="get_leave_balance",
        kind="query",
        roles=("EMPLOYEE", "MANAGER", "RH"),
        endpoints=(
            BackendEndpoint("GET", "/api/v1/leave-balances", "Current user leave balances"),
        ),
    ),
    "CREATE_LEAVE": ActionDefinition(
        intent="CREATE_LEAVE",
        action="create_leave",
        kind="mutation",
        roles=("EMPLOYEE",),
        workflow="create_leave_workflow",
        workflow_steps=(
            "extract_dates",
            "validate_dates",
            "check_leave_balance",
            "create_leave",
            "notify_manager",
            "return_confirmation",
        ),
        required_fields=("start_date", "end_date"),
        endpoints=(
            BackendEndpoint("POST", "/api/v1/conges", "Create leave request"),
        ),
    ),
    "CREATE_AUTORISATION": ActionDefinition(
        intent="CREATE_AUTORISATION",
        action="create_authorization",
        kind="mutation",
        roles=("EMPLOYEE",),
        workflow="create_authorization_workflow",
        workflow_steps=(
            "extract_schedule",
            "validate_schedule",
            "create_authorization",
            "notify_manager",
        ),
        required_fields=("request_date", "time_start", "time_end", "authorization_type"),
        endpoints=(
            BackendEndpoint("POST", "/api/v1/autorisations", "Create authorization request"),
        ),
    ),
    "CREATE_TELEWORK": ActionDefinition(
        intent="CREATE_TELEWORK",
        action="create_telework",
        kind="mutation",
        roles=("EMPLOYEE",),
        workflow="telework_workflow",
        workflow_steps=(
            "extract_dates",
            "validate_eligibility",
            "create_telework",
            "notify_manager",
        ),
        required_fields=("start_date", "end_date"),
        endpoints=(
            BackendEndpoint("POST", "/api/v1/teletravail", "Create telework request"),
        ),
    ),
    "REQUEST_DOCUMENT": ActionDefinition(
        intent="REQUEST_DOCUMENT",
        action="request_document",
        kind="mutation",
        roles=("EMPLOYEE",),
        workflow="document_request_workflow",
        workflow_steps=(
            "identify_document_type",
            "generate_document",
            "store_document",
            "return_download_link",
        ),
        required_fields=("document_type",),
        endpoints=(
            BackendEndpoint("POST", "/api/v1/documents", "Create document request"),
        ),
    ),
    "OPEN_DOCUMENT": ActionDefinition(
        intent="OPEN_DOCUMENT",
        action="open_document",
        kind="navigation",
        roles=("EMPLOYEE", "RH"),
        required_fields=("request_id",),
        endpoints=(
            BackendEndpoint("GET", "/api/v1/documents/{id}/telecharger", "Employee document download"),
            BackendEndpoint("GET", "/api/v1/documents/{id}/file", "RH document view"),
        ),
    ),
    "GET_NOTIFICATIONS": ActionDefinition(
        intent="GET_NOTIFICATIONS",
        action="get_notifications",
        kind="query",
        roles=("EMPLOYEE", "MANAGER", "RH", "ADMIN"),
        endpoints=(
            BackendEndpoint("GET", "/api/v1/notifications", "Organisation notifications"),
            BackendEndpoint("GET", "/api/v1/rh/notifications/mes-notifications", "RH notifications"),
        ),
    ),
    "GET_MY_REQUESTS": ActionDefinition(
        intent="GET_MY_REQUESTS",
        action="get_my_requests",
        kind="query",
        roles=("EMPLOYEE",),
        endpoints=(
            BackendEndpoint("GET", "/api/v1/rh/conges/me", "Current user leave requests"),
            BackendEndpoint("GET", "/api/v1/rh/autorisations/my-history", "Current user authorization requests"),
            BackendEndpoint("GET", "/api/v1/rh/teletravails/mes-demandes", "Current user telework requests"),
            BackendEndpoint("GET", "/api/v1/documents/mes-demandes", "Current user document requests"),
        ),
    ),
    "APPROVE_REQUEST": ActionDefinition(
        intent="APPROVE_REQUEST",
        action="approve_request",
        kind="mutation",
        roles=("MANAGER",),
        workflow="approve_request_workflow",
        workflow_steps=(
            "fetch_request",
            "validate_status",
            "approve_request",
            "notify_employee",
            "notify_rh",
            "return_success",
        ),
        required_fields=("type_demande", "request_id"),
        endpoints=(
            BackendEndpoint("PUT", "/api/v1/demandes/{id}/statut", "Manager generic approval route"),
        ),
    ),
    "REJECT_REQUEST": ActionDefinition(
        intent="REJECT_REQUEST",
        action="reject_request",
        kind="mutation",
        roles=("MANAGER",),
        workflow="reject_request_workflow",
        workflow_steps=(
            "fetch_request",
            "validate_status",
            "reject_request",
            "notify_employee",
            "notify_rh",
            "return_success",
        ),
        required_fields=("type_demande", "request_id"),
        endpoints=(
            BackendEndpoint("PUT", "/api/v1/demandes/{id}/statut", "Manager generic rejection route"),
        ),
    ),
    "GET_TEAM_REQUESTS": ActionDefinition(
        intent="GET_TEAM_REQUESTS",
        action="get_team_requests",
        kind="query",
        roles=("MANAGER",),
        endpoints=(
            BackendEndpoint("GET", "/api/v1/manager/workspace", "Manager workspace"),
            BackendEndpoint("GET", "/api/v1/demandes/manager/all", "Manager requests fallback"),
        ),
    ),
    "GET_PENDING_VALIDATIONS": ActionDefinition(
        intent="GET_PENDING_VALIDATIONS",
        action="get_pending_validations",
        kind="query",
        roles=("MANAGER",),
        endpoints=(
            BackendEndpoint("GET", "/api/v1/manager/workspace", "Manager workspace"),
            BackendEndpoint("GET", "/api/v1/requests/manager/pending", "Manager pending requests fallback"),
        ),
    ),
    "GET_RH_STATS": ActionDefinition(
        intent="GET_RH_STATS",
        action="get_rh_stats",
        kind="query",
        roles=("RH",),
        endpoints=(
            BackendEndpoint("GET", "/api/v1/rh/stats", "RH dashboard statistics"),
        ),
    ),
    "GET_ALL_REQUESTS": ActionDefinition(
        intent="GET_ALL_REQUESTS",
        action="get_all_requests",
        kind="query",
        roles=("RH",),
        endpoints=(
            BackendEndpoint("GET", "/api/v1/rh/demandes", "All enterprise requests"),
        ),
    ),
    "PROCESS_REQUEST": ActionDefinition(
        intent="PROCESS_REQUEST",
        action="process_request",
        kind="mutation",
        roles=("RH",),
        workflow="process_request_workflow",
        workflow_steps=(
            "fetch_request",
            "validate_status",
            "process_request",
            "notify_employee",
            "return_success",
        ),
        required_fields=("type_demande", "request_id", "decision"),
        endpoints=(
            BackendEndpoint("PUT", "/api/v1/rh/demandes/{id}/statut", "RH generic processing route"),
        ),
    ),
}


QUERY_INTENTS = {
    intent
    for intent, definition in ACTION_MAP.items()
    if definition.kind == "query"
}

MUTATING_INTENTS = {
    intent
    for intent, definition in ACTION_MAP.items()
    if definition.kind == "mutation"
}

NAVIGATION_INTENTS = {
    intent
    for intent, definition in ACTION_MAP.items()
    if definition.kind == "navigation"
}


def definition_for_intent(intent: str) -> ActionDefinition | None:
    return ACTION_MAP.get(intent)


def action_for_intent(intent: str) -> str | None:
    definition = definition_for_intent(intent)
    return definition.action if definition else None


def required_fields_for_intent(intent: str) -> tuple[str, ...]:
    definition = definition_for_intent(intent)
    return definition.required_fields if definition else ()


def workflow_for_intent(intent: str) -> str | None:
    definition = definition_for_intent(intent)
    return definition.workflow if definition else None


def workflow_steps_for_intent(intent: str) -> tuple[str, ...]:
    definition = definition_for_intent(intent)
    return definition.workflow_steps if definition else ()


def is_workflow_intent(intent: str) -> bool:
    return workflow_for_intent(intent) is not None


def role_can_execute(intent: str, role: str) -> bool:
    definition = definition_for_intent(intent)
    if definition is None:
        return False
    return (role or "EMPLOYEE").upper() in definition.roles


def is_query_intent(intent: str) -> bool:
    return intent in QUERY_INTENTS


def is_mutating_intent(intent: str) -> bool:
    return intent in MUTATING_INTENTS


def is_navigation_intent(intent: str) -> bool:
    return intent in NAVIGATION_INTENTS
