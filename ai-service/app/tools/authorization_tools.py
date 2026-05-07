from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result

AUTHORIZATION_CREATE_ROLES = {"EMPLOYEE"}
AUTHORIZATION_READ_ROLES = {"EMPLOYEE", "MANAGER", "RH"}
AUTHORIZATION_MANAGER_ROLES = {"MANAGER"}
AUTHORIZATION_RH_ROLES = {"RH"}
CAPABILITY_UNAVAILABLE = "Cette action d'autorisation n'est pas encore disponible pour votre role."


class EmptyAuthorizationInput(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=20, ge=1, le=50)


class AuthorizationStatusInput(BaseModel):
    request_id: int = Field(gt=0)


class CreateAuthorizationInput(BaseModel):
    request_date: str
    time_start: str
    time_end: str
    authorization_type: str | None = None
    type_authorization_id: int | None = Field(default=None, gt=0)
    reason: str | None = None


class DecideAuthorizationInput(BaseModel):
    request_id: int = Field(gt=0)
    decision: str
    comment: str | None = None


class AuthorizationTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="authorization.create_request",
                description="Cree une demande d'autorisation pour l'utilisateur authentifie.",
                input_model=CreateAuthorizationInput,
                output_model=None,
                type="write",
                allowed_roles=AUTHORIZATION_CREATE_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.create_request,
        )
        registry.register(
            ToolDefinition(
                name="authorization.list_my_requests",
                description="Retourne les demandes d'autorisation personnelles de l'utilisateur authentifie.",
                input_model=EmptyAuthorizationInput,
                output_model=None,
                type="read",
                allowed_roles=AUTHORIZATION_READ_ROLES,
            ),
            self.list_my_requests,
        )
        registry.register(
            ToolDefinition(
                name="authorization.get_status",
                description="Retourne le statut d'une demande d'autorisation accessible.",
                input_model=AuthorizationStatusInput,
                output_model=None,
                type="read",
                allowed_roles=AUTHORIZATION_READ_ROLES,
            ),
            self.get_status,
        )
        registry.register(
            ToolDefinition(
                name="authorization.manager_decide",
                description="Decision manager sur une demande d'autorisation.",
                input_model=DecideAuthorizationInput,
                output_model=None,
                type="write",
                allowed_roles=AUTHORIZATION_MANAGER_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.manager_decide,
        )
        registry.register(
            ToolDefinition(
                name="authorization.rh_decide",
                description="Decision RH sur une demande d'autorisation.",
                input_model=DecideAuthorizationInput,
                output_model=None,
                type="write",
                allowed_roles=AUTHORIZATION_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.rh_decide,
        )

    async def create_request(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        type_payload = await self._resolve_type_payload(payload, context)
        if type_payload is None:
            return ToolResult.fail(
                "authorization_type_required",
                "Le type d'autorisation est obligatoire et doit exister dans le referentiel RH.",
                status_code=400,
            )
        body = {
            "dateAutorisation": getattr(payload, "request_date"),
            "heureDebut": _normalize_time(getattr(payload, "time_start")),
            "heureFin": _normalize_time(getattr(payload, "time_end")),
            "typeAutorisation": type_payload,
        }
        reason = _clean_optional(getattr(payload, "reason", None))
        if reason:
            body["motif"] = reason
            body["commentaire"] = reason
        # Employee-facing create is exposed through the compatibility route.
        # RH-prefixed routes are still used for listing/status/decisions below.
        result = await self.backend_client.post("/autorisations", context=context, json=body)
        if not result.success:
            return self._write_failure("authorization.create_request", result)
        return _write_success("authorization.create_request", "Votre demande d'autorisation a ete creee.", result)

    async def list_my_requests(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        params = {"page": getattr(payload, "page", 0), "size": getattr(payload, "size", 20)}
        result = await self.backend_client.get("/rh/autorisations/me", context=context, params=params)
        if not result.success:
            return self._read_failure("authorization.list_my_requests", result)
        items = _as_list(result.data)
        count = _extract_count(result.data, items)
        summary = _request_summary(items, "autorisations") if items else "Aucune autorisation trouvee."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="authorization.list_my_requests",
                    summary=summary,
                    items=items,
                    count=count,
                    data=result.data if isinstance(result.data, dict) else {"items": items},
                    backend_status=result.status_code,
                    empty=count == 0,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def get_status(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        request_id = int(getattr(payload, "request_id"))
        result = await self.backend_client.get(f"/rh/autorisations/{request_id}", context=context)
        if not result.success:
            return self._read_failure("authorization.get_status", result)
        item = result.data if isinstance(result.data, dict) else {"value": result.data}
        status = item.get("statut") or item.get("status") or "statut inconnu"
        summary = f"Autorisation {request_id}: {str(status).replace('_', ' ').lower()}."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="authorization.get_status",
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
        return await self._decide(payload, context, role="manager")

    async def rh_decide(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        return await self._decide(payload, context, role="rh")

    async def _decide(self, payload: BaseModel, context: CurrentUserContext, *, role: str) -> ToolResult:
        request_id = int(getattr(payload, "request_id"))
        decision = _normalize_decision(getattr(payload, "decision", None))
        if decision not in {"APPROVE", "REJECT"}:
            return ToolResult.fail("capability_unavailable", CAPABILITY_UNAVAILABLE, status_code=400)
        if decision == "APPROVE":
            path = f"/rh/autorisations/{request_id}/{role}/validate"
            body = None
        else:
            path = f"/rh/autorisations/{request_id}/reject"
            comment = _clean_optional(getattr(payload, "comment", None))
            body = {"commentaire": comment} if comment else {}
        result = await self.backend_client.request("PATCH", path, context=context, json=body)
        if not result.success:
            return self._write_failure(f"authorization.{role}_decide", result)
        label = "approuvee" if decision == "APPROVE" else "refusee"
        return _write_success(f"authorization.{role}_decide", f"La demande d'autorisation a ete {label}.", result)

    async def _resolve_type_payload(self, payload: BaseModel, context: CurrentUserContext) -> dict[str, Any] | None:
        type_id = getattr(payload, "type_authorization_id", None)
        if type_id is not None:
            return {"id": type_id}
        label = _normalize_authorization_type(getattr(payload, "authorization_type", None))
        if not label:
            return None
        result = await self.backend_client.get("/rh/parametres/types-autorisations", context=context)
        if result.success:
            normalized = _normalize_label(label)
            for item in _as_list(result.data):
                if not isinstance(item, dict):
                    continue
                candidate_label = item.get("libelle") or item.get("label") or item.get("name")
                candidate_code = item.get("code") or item.get("type")
                if normalized in {_normalize_label(candidate_label), _normalize_label(candidate_code)}:
                    item_id = item.get("id")
                    if item_id is not None:
                        return {"id": item_id}
                    if candidate_label:
                        return {"libelle": candidate_label}
        return {"libelle": label}

    def _read_failure(self, tool_name: str, result: ToolResult) -> ToolResult:
        message = _clean_error(result)
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
        message = _clean_error(result)
        error_code = "capability_unavailable" if result.status_code == 404 else (result.error_code or "backend_error")
        return ToolResult.fail(
            error_code,
            message,
            status_code=result.status_code,
            data={
                "kind": "write_result",
                "toolName": tool_name,
                "summary": message,
                "data": result.data if isinstance(result.data, dict) else {},
                "error": {"code": error_code, "message": message},
                "backendStatus": result.status_code,
            },
            warnings=result.warnings,
        )


def register_authorization_tools(registry: ToolRegistry, backend_client: BackendClient) -> AuthorizationTools:
    tools = AuthorizationTools(backend_client)
    tools.register(registry)
    return tools


def _normalize_time(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return text
    if len(text) == 5:
        return f"{text}:00"
    return text


def _normalize_authorization_type(value: Any) -> str | None:
    text = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    if not text:
        return None
    aliases = {
        "SORTIE": "SORTIE_ANTICIPEE",
        "LEAVE_EARLY": "SORTIE_ANTICIPEE",
        "EARLY_LEAVE": "SORTIE_ANTICIPEE",
        "LATE_ARRIVAL": "ARRIVEE_TARDIVE",
        "TEMPORARY_ABSENCE": "ABSENCE_TEMPORAIRE",
        "RDV_MEDICAL": "ABSENCE_TEMPORAIRE",
        "MEDICAL_APPOINTMENT": "ABSENCE_TEMPORAIRE",
        "PERMISSION": "AUTRE",
    }
    return aliases.get(text, text)


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
        for key in ("items", "content", "data", "authorizations", "autorisations", "demandes"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
    return []


def _extract_count(data: Any, items: list[Any]) -> int:
    if isinstance(data, dict):
        for key in ("totalElements", "total", "count", "totalCount"):
            value = data.get(key)
            if isinstance(value, int):
                return value
            if isinstance(value, float) and value.is_integer():
                return int(value)
    return len(items)


def _request_summary(items: list[Any], label: str) -> str:
    counts: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        status = str(item.get("statut") or item.get("status") or "INCONNU").upper()
        counts[status] = counts.get(status, 0) + 1
    if not counts:
        return f"Vous avez {len(items)} {label}."
    parts = [f"{count} {status.replace('_', ' ').lower()}" for status, count in sorted(counts.items())]
    return f"Vous avez {len(items)} {label}: " + ", ".join(parts) + "."


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


def _normalize_label(value: Any) -> str:
    return str(value or "").strip().upper().replace("-", "_").replace(" ", "_")


def _clean_error(result: ToolResult) -> str:
    message = (result.error_message or "").strip()
    lower = message.lower()
    if result.error_code == "capability_unavailable":
        return message or CAPABILITY_UNAVAILABLE
    if result.status_code == 409 or "deja" in lower or "déjà" in lower or "conflict" in lower:
        return "Une demande d'autorisation existe deja pour cette periode."
    if result.status_code in (401, 403):
        return "Vous n'avez pas les droits necessaires pour cette demande d'autorisation."
    if result.status_code == 404:
        return "La demande d'autorisation est introuvable ou indisponible."
    if result.status_code == 400:
        return message or "La demande d'autorisation est incomplete."
    if result.status_code is None or result.status_code >= 500:
        return "Le service autorisations est momentanement indisponible. Reessayez dans quelques instants."
    return message or "Impossible de traiter cette demande d'autorisation."
