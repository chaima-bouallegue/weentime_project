from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result

TELEWORK_CREATE_ROLES = {"EMPLOYEE"}
TELEWORK_READ_ROLES = {"EMPLOYEE", "MANAGER", "RH"}
TELEWORK_MANAGER_ROLES = {"MANAGER"}
TELEWORK_RH_ROLES = {"RH"}
CAPABILITY_UNAVAILABLE = "Cette action teletravail n'est pas encore disponible pour votre role."


class EmptyTeleworkInput(BaseModel):
    pass


class TeleworkStatusInput(BaseModel):
    request_id: int = Field(gt=0)


class CreateTeleworkInput(BaseModel):
    start_date: str
    end_date: str
    telework_type: str | None = None
    period: str | None = None
    reason: str | None = None


class DecideTeleworkInput(BaseModel):
    request_id: int = Field(gt=0)
    decision: str
    comment: str | None = None


class RHTeleworkDecisionInput(BaseModel):
    request_id: int = Field(gt=0)
    comment: str | None = None


class TeleworkTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="telework.create_request",
                description="Cree une demande de teletravail pour l'utilisateur authentifie.",
                input_model=CreateTeleworkInput,
                output_model=None,
                type="write",
                allowed_roles=TELEWORK_CREATE_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.create_request,
        )
        registry.register(
            ToolDefinition(
                name="telework.list_my_requests",
                description="Retourne les demandes de teletravail personnelles de l'utilisateur authentifie.",
                input_model=EmptyTeleworkInput,
                output_model=None,
                type="read",
                allowed_roles=TELEWORK_READ_ROLES,
            ),
            self.list_my_requests,
        )
        registry.register(
            ToolDefinition(
                name="telework.get_status",
                description="Retourne le statut d'une demande de teletravail accessible.",
                input_model=TeleworkStatusInput,
                output_model=None,
                type="read",
                allowed_roles=TELEWORK_READ_ROLES,
            ),
            self.get_status,
        )
        registry.register(
            ToolDefinition(
                name="telework.list_manager_requests",
                description="Retourne les demandes de teletravail accessibles au manager authentifie.",
                input_model=EmptyTeleworkInput,
                output_model=None,
                type="read",
                allowed_roles=TELEWORK_MANAGER_ROLES,
            ),
            self.list_manager_requests,
        )
        registry.register(
            ToolDefinition(
                name="telework.list_rh_pending",
                description="Retourne les demandes de teletravail en attente de validation RH.",
                input_model=EmptyTeleworkInput,
                output_model=None,
                type="read",
                allowed_roles=TELEWORK_RH_ROLES,
            ),
            self.list_rh_pending,
        )
        registry.register(
            ToolDefinition(
                name="rh.telework.pending",
                description="Retourne les demandes de teletravail en attente de validation RH.",
                input_model=EmptyTeleworkInput,
                output_model=None,
                type="read",
                allowed_roles=TELEWORK_RH_ROLES,
            ),
            self.rh_pending_alias,
        )
        registry.register(
            ToolDefinition(
                name="telework.manager_decide",
                description="Decision manager sur une demande de teletravail.",
                input_model=DecideTeleworkInput,
                output_model=None,
                type="write",
                allowed_roles=TELEWORK_MANAGER_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.manager_decide,
        )
        registry.register(
            ToolDefinition(
                name="telework.rh_decide",
                description="Decision RH sur une demande de teletravail.",
                input_model=DecideTeleworkInput,
                output_model=None,
                type="write",
                allowed_roles=TELEWORK_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.rh_decide,
        )
        registry.register(
            ToolDefinition(
                name="rh.telework.approve",
                description="Valide une demande de teletravail cote RH.",
                input_model=RHTeleworkDecisionInput,
                output_model=None,
                type="write",
                allowed_roles=TELEWORK_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.rh_approve_alias,
        )
        registry.register(
            ToolDefinition(
                name="rh.telework.reject",
                description="Refuse une demande de teletravail cote RH.",
                input_model=RHTeleworkDecisionInput,
                output_model=None,
                type="write",
                allowed_roles=TELEWORK_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.rh_reject_alias,
        )

    async def create_request(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        body = {
            "type": _normalize_telework_type(getattr(payload, "telework_type", None)),
            "dateDebut": getattr(payload, "start_date"),
            "dateFin": getattr(payload, "end_date"),
        }
        period = _normalize_period(getattr(payload, "period", None))
        reason = _clean_optional(getattr(payload, "reason", None))
        if period:
            body["periode"] = period
        if reason:
            body["motif"] = reason
        result = await self.backend_client.post("/rh/teletravail", context=context, json=body)
        if not result.success:
            return self._write_failure("telework.create_request", result)
        return _write_success("telework.create_request", "Votre demande de teletravail a ete creee.", result)

    async def list_my_requests(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/teletravail/mes-demandes", context=context)
        if not result.success:
            return self._read_failure("telework.list_my_requests", result)
        items = _as_list(result.data)
        summary = _request_summary(items, "teletravail") if items else "Aucune demande de teletravail trouvee."
        return _read_success("telework.list_my_requests", result, items, summary)

    async def list_manager_requests(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/teletravail/demandes-equipe", context=context)
        if not result.success:
            return self._read_failure("telework.list_manager_requests", result)
        items = _as_list(result.data)
        summary = _request_summary(items, "teletravail d'equipe") if items else "Aucune demande de teletravail d'equipe trouvee."
        return _read_success("telework.list_manager_requests", result, items, summary)

    async def list_rh_pending(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.backend_client.get("/rh/teletravail/en-attente-rh", context=context)
        if not result.success:
            return self._read_failure("telework.list_rh_pending", result)
        items = _as_list(result.data)
        summary = _request_summary(items, "teletravail en attente RH") if items else "Aucune demande de teletravail en attente RH trouvee."
        return _read_success("telework.list_rh_pending", result, items, summary)

    async def rh_pending_alias(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self.list_rh_pending(_, context)
        return _rename_read_tool(result, "rh.telework.pending")

    async def get_status(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        request_id = int(getattr(payload, "request_id"))
        result = await self.backend_client.get(f"/rh/teletravail/{request_id}", context=context)
        if not result.success:
            return self._read_failure("telework.get_status", result)
        item = result.data if isinstance(result.data, dict) else {"value": result.data}
        status = item.get("statut") or item.get("status") or "statut inconnu"
        summary = f"Demande de teletravail {request_id}: {str(status).replace('_', ' ').lower()}."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="telework.get_status",
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

    async def manager_decide(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._decide(payload, context, role_prefix="manager")

    async def rh_decide(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._decide(payload, context, role_prefix="rh")

    async def rh_approve_alias(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        model = DecideTeleworkInput(request_id=int(getattr(payload, "request_id")), decision="APPROVE", comment=getattr(payload, "comment", None))
        result = await self._decide(model, context, role_prefix="rh")
        return _rename_write_tool(result, "rh.telework.approve")

    async def rh_reject_alias(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        model = DecideTeleworkInput(request_id=int(getattr(payload, "request_id")), decision="REJECT", comment=getattr(payload, "comment", None))
        result = await self._decide(model, context, role_prefix="rh")
        return _rename_write_tool(result, "rh.telework.reject")

    async def _decide(self, payload: BaseModel, context: CurrentUserContext, *, role_prefix: str) -> ToolResult:
        request_id = int(getattr(payload, "request_id"))
        decision = _normalize_decision(getattr(payload, "decision", None))
        if decision not in {"APPROVE", "REJECT"}:
            return ToolResult.fail("capability_unavailable", CAPABILITY_UNAVAILABLE, status_code=400)
        action = "valider" if decision == "APPROVE" else "rejeter"
        path = f"/rh/teletravail/{request_id}/{action}-{role_prefix}"
        comment = _clean_optional(getattr(payload, "comment", None))
        result = await self.backend_client.request("PATCH", path, context=context, json={"commentaire": comment} if comment else {})
        if not result.success:
            return self._write_failure(f"telework.{role_prefix}_decide", result)
        label = "approuvee" if decision == "APPROVE" else "refusee"
        return _write_success(f"telework.{role_prefix}_decide", f"La demande de teletravail a ete {label}.", result)

    def _read_failure(self, tool_name: str, result: ToolResult) -> ToolResult:
        message = _clean_error(result, domain="teletravail")
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
                    data=result.data if isinstance(result.data, dict) else {},
                    error={"code": result.error_code, "message": message},
                    backend_status=result.status_code,
                    empty=True,
                )
            },
            warnings=result.warnings,
        )

    @staticmethod
    def _write_failure(tool_name: str, result: ToolResult) -> ToolResult:
        message = _clean_error(result, domain="teletravail")
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


def register_telework_tools(registry: ToolRegistry, backend_client: BackendClient) -> TeleworkTools:
    tools = TeleworkTools(backend_client)
    tools.register(registry)
    return tools


def _normalize_telework_type(value: Any) -> str:
    text = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    aliases = {
        "FULL_DAY": "JOURNEE_COMPLETE",
        "DAY": "JOURNEE_COMPLETE",
        "MORNING": "DEMI_JOURNEE_MATIN",
        "AFTERNOON": "DEMI_JOURNEE_APRES_MIDI",
        "WEEK": "SEMAINE_COMPLETE",
    }
    return aliases.get(text, text or "JOURNEE_COMPLETE")


def _normalize_period(value: Any) -> str | None:
    text = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    if text in {"MATIN", "MORNING"}:
        return "MATIN"
    if text in {"APRES_MIDI", "APRÈS_MIDI", "AFTERNOON"}:
        return "APRES_MIDI"
    return None


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


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("items", "content", "data", "teletravails", "demandes"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
    return []


def _request_summary(items: list[Any], label: str) -> str:
    counts: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        status = str(item.get("statut") or item.get("status") or "INCONNU").upper()
        counts[status] = counts.get(status, 0) + 1
    if not counts:
        return f"Vous avez {len(items)} demande(s) de {label}."
    parts = [f"{count} {status.replace('_', ' ').lower()}" for status, count in sorted(counts.items())]
    return f"Vous avez {len(items)} demande(s) de {label}: " + ", ".join(parts) + "."


def _read_success(tool_name: str, result: ToolResult, items: list[Any], summary: str) -> ToolResult:
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


def _clean_error(result: ToolResult, *, domain: str) -> str:
    message = (result.error_message or "").strip()
    lower = message.lower()
    if result.error_code == "capability_unavailable":
        return message or CAPABILITY_UNAVAILABLE
    if result.status_code == 409 or "deja" in lower or "déjà" in lower or "conflict" in lower:
        return f"Une demande de {domain} existe deja pour cette periode."
    if result.status_code in (401, 403):
        return f"Vous n'avez pas les droits necessaires pour cette demande de {domain}."
    if result.status_code == 404:
        return f"La demande de {domain} est introuvable ou indisponible."
    if result.status_code == 400:
        return message or f"La demande de {domain} est incomplete."
    if result.status_code is None or result.status_code >= 500:
        return f"Le service {domain} est momentanement indisponible. Reessayez dans quelques instants."
    return message or f"Impossible de traiter cette demande de {domain}."


def _rename_read_tool(result: ToolResult, tool_name: str) -> ToolResult:
    if not isinstance(result.data, dict):
        return result
    read_result = result.data.get("read_result")
    if not isinstance(read_result, dict):
        return result
    cloned = dict(read_result)
    cloned["toolName"] = tool_name
    return ToolResult(
        success=result.success,
        data={"read_result": cloned},
        warnings=result.warnings,
        error_code=result.error_code,
        error_message=result.error_message,
        status_code=result.status_code,
    )


def _rename_write_tool(result: ToolResult, tool_name: str) -> ToolResult:
    if not isinstance(result.data, dict):
        return result
    if result.data.get("kind") != "write_result":
        return result
    cloned = dict(result.data)
    cloned["toolName"] = tool_name
    return ToolResult(
        success=result.success,
        data=cloned,
        warnings=result.warnings,
        error_code=result.error_code,
        error_message=result.error_message,
        status_code=result.status_code,
    )
