from __future__ import annotations

import unicodedata
from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result

LEAVE_READ_ROLES = {"EMPLOYEE", "MANAGER", "RH"}
LEAVE_WRITE_ROLES = {"EMPLOYEE"}
LEAVE_MANAGER_ROLES = {"MANAGER"}
LEAVE_RH_ROLES = {"RH"}
LEAVE_UNAVAILABLE = "Cette action conge n'est pas encore disponible pour votre role."


class EmptyLeaveInput(BaseModel):
    pass


class LeaveStatusInput(BaseModel):
    request_id: int = Field(gt=0)


class CreateLeaveInput(BaseModel):
    start_date: str
    end_date: str
    reason: str
    type_conge_id: int | None = Field(default=None, gt=0)
    leave_type_label: str | None = None
    justificatif_fourni: bool | None = None


class DecideLeaveInput(BaseModel):
    request_id: int = Field(gt=0)
    decision: str
    comment: str | None = None


class LeaveTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="leave.get_balance",
                description="Retourne le solde de conges de l'utilisateur authentifie.",
                input_model=EmptyLeaveInput,
                output_model=None,
                type="read",
                allowed_roles=LEAVE_READ_ROLES,
            ),
            self.get_balance,
        )
        registry.register(
            ToolDefinition(
                name="leave.list_my_requests",
                description="Retourne les demandes de conge personnelles de l'utilisateur authentifie.",
                input_model=EmptyLeaveInput,
                output_model=None,
                type="read",
                allowed_roles=LEAVE_READ_ROLES,
            ),
            self.list_my_requests,
        )
        registry.register(
            ToolDefinition(
                name="leave.get_request_status",
                description="Retourne le detail d'une demande de conge accessible a l'utilisateur.",
                input_model=LeaveStatusInput,
                output_model=None,
                type="read",
                allowed_roles=LEAVE_READ_ROLES,
            ),
            self.get_request_status,
        )
        registry.register(
            ToolDefinition(
                name="leave.list_manager_requests",
                description="Retourne les demandes de conge accessibles au manager authentifie.",
                input_model=EmptyLeaveInput,
                output_model=None,
                type="read",
                allowed_roles=LEAVE_MANAGER_ROLES,
            ),
            self.list_manager_requests,
        )
        registry.register(
            ToolDefinition(
                name="leave.list_rh_pending",
                description="Retourne les demandes de conge en attente de validation RH.",
                input_model=EmptyLeaveInput,
                output_model=None,
                type="read",
                allowed_roles=LEAVE_RH_ROLES,
            ),
            self.list_rh_pending,
        )
        registry.register(
            ToolDefinition(
                name="leave.create_request",
                description="Cree une demande de conge pour l'utilisateur authentifie.",
                input_model=CreateLeaveInput,
                output_model=None,
                type="write",
                allowed_roles=LEAVE_WRITE_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.create_request,
        )
        registry.register(
            ToolDefinition(
                name="leave.manager_decide",
                description="Decision manager sur une demande de conge.",
                input_model=DecideLeaveInput,
                output_model=None,
                type="write",
                allowed_roles=LEAVE_MANAGER_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.manager_decide,
        )
        registry.register(
            ToolDefinition(
                name="leave.rh_decide",
                description="Decision RH finale sur une demande de conge.",
                input_model=DecideLeaveInput,
                output_model=None,
                type="write",
                allowed_roles=LEAVE_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.rh_decide,
        )

    async def get_balance(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/solde-conges/me/all", context=context)
        if not result.success:
            return self._read_failure("leave.get_balance", result)
        balances = _as_list(result.data)
        total = _sum_number(balances, "joursRestants")
        summary = (
            f"Il vous reste {self._format_number(total)} jours de conge."
            if balances
            else "Aucun solde de conge disponible pour votre compte."
        )
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="leave.get_balance",
                    summary=summary,
                    items=balances,
                    count=len(balances),
                    data={"total": total, "balances": balances},
                    backend_status=result.status_code,
                    empty=not balances,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def list_my_requests(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/conges/me", context=context)
        if not result.success:
            return self._read_failure("leave.list_my_requests", result)
        items = _as_list(result.data)
        summary = self._request_summary(items) if items else "Aucune demande de conge n'a ete trouvee."
        return self._list_success("leave.list_my_requests", result, items, summary)

    async def list_manager_requests(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/conges/manager", context=context)
        if not result.success:
            return self._read_failure("leave.list_manager_requests", result)
        items = _as_list(result.data)
        summary = self._request_summary(items) if items else "Aucune demande de conge d'equipe trouvee."
        return self._list_success("leave.list_manager_requests", result, items, summary)

    async def list_rh_pending(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/conges/rh/pending", context=context)
        if not result.success:
            return self._read_failure("leave.list_rh_pending", result)
        items = _as_list(result.data)
        summary = self._request_summary(items) if items else "Aucune demande de conge en attente RH trouvee."
        return self._list_success("leave.list_rh_pending", result, items, summary)

    async def get_request_status(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        request_id = getattr(payload, "request_id")
        result = await self.backend_client.get(f"/rh/conges/{request_id}", context=context)
        if not result.success:
            return self._read_failure("leave.get_request_status", result)
        item = result.data if isinstance(result.data, dict) else {"value": result.data}
        status = item.get("statut") or item.get("status") or "statut inconnu"
        summary = f"Demande de conge {request_id}: {status}."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="leave.get_request_status",
                    summary=summary,
                    items=[item],
                    count=1,
                    data=item,
                    backend_status=result.status_code,
                    empty=False,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def create_request(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        type_conge_id = getattr(payload, "type_conge_id", None)
        if type_conge_id is None:
            type_conge_id = await self._resolve_type_conge_id(getattr(payload, "leave_type_label", None), context)
        if type_conge_id is None:
            return ToolResult.fail(
                "leave_type_required",
                "Le type de conge est obligatoire pour creer la demande.",
                status_code=400,
            )

        body = {
            "dateDebut": getattr(payload, "start_date"),
            "dateFin": getattr(payload, "end_date"),
            "motif": getattr(payload, "reason"),
            "commentaire": getattr(payload, "reason"),
            "typeCongeId": type_conge_id,
        }
        justificatif = getattr(payload, "justificatif_fourni", None)
        if justificatif is not None:
            body["justificatifFourni"] = justificatif
        return await self.backend_client.post("/rh/conges", context=context, json=body)

    async def manager_decide(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._decide(payload, context, role="manager")

    async def rh_decide(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._decide(payload, context, role="rh")

    async def _decide(self, payload: BaseModel, context: CurrentUserContext, *, role: str) -> ToolResult:
        request_id = int(getattr(payload, "request_id"))
        decision = _normalize_decision(getattr(payload, "decision", None))
        if decision not in {"APPROVE", "REJECT"}:
            return ToolResult.fail("capability_unavailable", LEAVE_UNAVAILABLE, status_code=400)

        if decision == "APPROVE":
            path = f"/rh/conges/{request_id}/valider" if role == "manager" else f"/rh/conges/{request_id}/valider-rh"
            body = None
        else:
            path = f"/rh/conges/{request_id}/refuser"
            comment = _clean_optional(getattr(payload, "comment", None))
            body = {"commentaire": comment} if comment else {}

        result = await self.backend_client.request("PATCH", path, context=context, json=body)
        if not result.success:
            return self._write_failure(f"leave.{role}_decide", result)
        label = "approuvee" if decision == "APPROVE" else "refusee"
        return _write_success(f"leave.{role}_decide", f"La demande de conge a ete {label}.", result)

    async def _resolve_type_conge_id(self, label: str | None, context: CurrentUserContext) -> int | None:
        normalized_label = _normalize_label(label)
        if not normalized_label:
            return None
        result = await self.backend_client.get("/rh/type-conges", context=context)
        if not result.success:
            return None
        for item in _as_list(result.data):
            if not isinstance(item, dict):
                continue
            candidate = _normalize_label(item.get("libelle") or item.get("nom") or item.get("name") or item.get("label"))
            if candidate and (candidate == normalized_label or normalized_label in candidate or candidate in normalized_label):
                value = item.get("id")
                return int(value) if isinstance(value, (int, float, str)) and str(value).isdigit() else None
        return None

    def _read_failure(self, tool_name: str, result: ToolResult) -> ToolResult:
        message = _clean_read_error(result)
        return ToolResult.fail(
            result.error_code or "backend_error",
            message,
            status_code=result.status_code,
            data={
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=message,
                    items=[],
                    count=0,
                    data=result.data,
                    error={"code": result.error_code, "message": message},
                    backend_status=result.status_code,
                    empty=True,
                )
            },
            warnings=result.warnings,
        )

    @staticmethod
    def _write_failure(tool_name: str, result: ToolResult) -> ToolResult:
        message = _clean_write_error(result)
        return ToolResult.fail(
            result.error_code or "backend_error",
            message,
            status_code=result.status_code,
            data={
                "kind": "write_result",
                "toolName": tool_name,
                "summary": message,
                "data": result.data if isinstance(result.data, dict) else {},
                "error": {"code": result.error_code, "message": message},
                "backendStatus": result.status_code,
            },
            warnings=result.warnings,
        )

    @staticmethod
    def _list_success(tool_name: str, result: ToolResult, items: list[Any], summary: str) -> ToolResult:
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=summary,
                    items=items,
                    count=len(items),
                    data={"items": items},
                    backend_status=result.status_code,
                    empty=not items,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    @staticmethod
    def _request_summary(items: list[Any]) -> str:
        counts: dict[str, int] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            status = str(item.get("statut") or item.get("status") or "INCONNU").upper()
            counts[status] = counts.get(status, 0) + 1
        if not counts:
            return f"Vous avez {len(items)} demande(s) de conge."
        parts = [f"{count} {status.replace('_', ' ').lower()}" for status, count in sorted(counts.items())]
        return f"Vous avez {len(items)} demande(s) de conge: " + ", ".join(parts) + "."

    @staticmethod
    def _format_number(value: float) -> str:
        return str(int(value)) if float(value).is_integer() else f"{value:.1f}".rstrip("0").rstrip(".")


def register_leave_tools(registry: ToolRegistry, backend_client: BackendClient) -> LeaveTools:
    tools = LeaveTools(backend_client)
    tools.register(registry)
    return tools


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("items", "content", "data", "balances"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
    return []


def _sum_number(items: list[Any], key: str) -> float:
    total = 0.0
    for item in items:
        if isinstance(item, dict) and isinstance(item.get(key), (int, float)):
            total += float(item[key])
    return total


def _normalize_decision(value: Any) -> str:
    text = str(value or "").strip().upper()
    if text in {"APPROVE", "APPROVED", "APPROUVE", "APPROUVEE", "VALIDER", "VALIDE", "ACCEPTER", "ACCEPTE"}:
        return "APPROVE"
    if text in {"REJECT", "REJECTED", "REFUSE", "REFUSER", "REJETER", "REJETTE"}:
        return "REJECT"
    return text


def _clean_optional(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_label(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(text.replace("-", " ").replace("_", " ").split())


def _clean_read_error(result: ToolResult) -> str:
    if result.status_code == 403:
        return "Vous n'avez pas les droits necessaires pour consulter ces conges."
    if result.status_code == 404:
        return "Les informations de conge demandees sont indisponibles."
    if result.status_code is None or result.status_code >= 500:
        return "Le service RH est momentanement indisponible. Reessayez dans quelques instants."
    return result.error_message or "Impossible de recuperer les informations de conge."


def _clean_write_error(result: ToolResult) -> str:
    message = (result.error_message or "").strip()
    lower = message.lower()
    if result.error_code == "capability_unavailable":
        return message or LEAVE_UNAVAILABLE
    if result.status_code == 409 or "deja" in lower or "déjà" in lower or "conflict" in lower:
        return "Cette demande de conge a deja ete traitee ou entre en conflit avec l'etat actuel."
    if result.status_code in (401, 403):
        return "Vous n'avez pas les droits necessaires pour traiter cette demande de conge."
    if result.status_code == 404:
        return "La demande de conge est introuvable ou indisponible."
    if result.status_code == 400:
        return message or "La decision sur cette demande de conge est incomplete."
    if result.status_code is None or result.status_code >= 500:
        return "Le service RH est momentanement indisponible. Reessayez dans quelques instants."
    return message or "Impossible de traiter cette demande de conge."


def _write_success(tool_name: str, summary: str, result: ToolResult) -> ToolResult:
    return ToolResult.ok(
        {
            "kind": "write_result",
            "toolName": tool_name,
            "summary": summary,
            "data": result.data,
            "backendStatus": result.status_code,
        },
        warnings=result.warnings,
        status_code=result.status_code,
    )
