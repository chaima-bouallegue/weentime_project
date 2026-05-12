from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition

from .backend_client import BackendClient
from .registry import ToolRegistry
from .result import ToolResult, build_read_result

DOCUMENT_READ_ROLES = {"EMPLOYEE", "RH"}
DOCUMENT_CREATE_ROLES = {"EMPLOYEE"}
DOCUMENT_RH_ROLES = {"RH"}
DOCUMENT_CREATE_UNAVAILABLE = "Le type de document est obligatoire pour creer la demande."


class EmptyDocumentInput(BaseModel):
    pass


class CreateDocumentInput(BaseModel):
    document_type: str | None = None
    type_document_id: int | None = Field(default=None, gt=0)
    reason: str | None = None
    month: str | None = None


class DocumentStatusInput(BaseModel):
    request_id: int = Field(gt=0)


class OpenDocumentInput(BaseModel):
    request_id: int = Field(gt=0)


class RhGenerateDocumentInput(BaseModel):
    type: str
    label: str
    employe_nom: str
    employe_prenom: str
    employe_poste: str | None = None
    employe_departement: str | None = None
    date_entree: str | None = None
    mois_concerne: str | None = None


class RhRejectDocumentInput(BaseModel):
    request_id: int = Field(gt=0)
    reason: str


class DocumentTools:
    def __init__(self, backend_client: BackendClient) -> None:
        self.backend_client = backend_client

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="document.create_request",
                description="Cree une demande de document pour l'utilisateur authentifie.",
                input_model=CreateDocumentInput,
                output_model=None,
                type="write",
                allowed_roles=DOCUMENT_CREATE_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.create_request,
        )
        registry.register(
            ToolDefinition(
                name="document.list_my_requests",
                description="Retourne les demandes de documents personnelles de l'utilisateur authentifie.",
                input_model=EmptyDocumentInput,
                output_model=None,
                type="read",
                allowed_roles=DOCUMENT_READ_ROLES,
            ),
            self.list_my_requests,
        )
        registry.register(
            ToolDefinition(
                name="document.get_status",
                description="Retourne le statut d'une demande de document accessible a l'utilisateur.",
                input_model=DocumentStatusInput,
                output_model=None,
                type="read",
                allowed_roles=DOCUMENT_READ_ROLES,
            ),
            self.get_status,
        )
        registry.register(
            ToolDefinition(
                name="document.open",
                description="Retourne une URL API autorisee pour ouvrir un document pret.",
                input_model=OpenDocumentInput,
                output_model=None,
                type="read",
                allowed_roles=DOCUMENT_READ_ROLES,
            ),
            self.open_document,
        )
        registry.register(
            ToolDefinition(
                name="document.rh_generate",
                description="Genere un contenu de document RH via l'endpoint RH existant.",
                input_model=RhGenerateDocumentInput,
                output_model=None,
                type="write",
                allowed_roles=DOCUMENT_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.rh_generate,
        )
        registry.register(
            ToolDefinition(
                name="document.rh_reject",
                description="Refuse une demande de document RH.",
                input_model=RhRejectDocumentInput,
                output_model=None,
                type="write",
                allowed_roles=DOCUMENT_RH_ROLES,
                requires_confirmation=True,
                idempotency_required=True,
            ),
            self.rh_reject,
        )

    async def create_request(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        document_type = _normalize_document_type(getattr(payload, "document_type", None))
        type_document_id = getattr(payload, "type_document_id", None)
        if not document_type and type_document_id is None:
            return ToolResult.fail("document_type_required", DOCUMENT_CREATE_UNAVAILABLE, status_code=400)

        body: dict[str, Any] = {}
        if type_document_id is not None:
            body["typeDocumentId"] = type_document_id
        if document_type:
            body["type"] = document_type
        reason = _clean_optional(getattr(payload, "reason", None))
        month = _clean_optional(getattr(payload, "month", None))
        if reason:
            body["motif"] = reason
        if month:
            body["moisConcerne"] = month

        result = await self.backend_client.post("/documents", context=context, json=body)
        if not result.success:
            return self._write_failure("document.create_request", result)
        return ToolResult.ok(
            {
                "kind": "write_result",
                "toolName": "document.create_request",
                "summary": "Votre demande de document a ete creee.",
                "data": _sanitize_document_item(result.data),
                "backendStatus": result.status_code,
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def list_my_requests(self, _: BaseModel, context: CurrentUserContext) -> ToolResult:
        result = await self._list_accessible_documents(context)
        if not result.success:
            return self._read_failure("document.list_my_requests", result)
        items = [_sanitize_document_item(item) for item in _as_list(result.data)]
        summary = _document_list_summary(items) if items else "Aucun document trouve."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="document.list_my_requests",
                    summary=summary,
                    items=items,
                    count=len(items),
                    data={"items": items, "countsByStatus": _status_counts(items), "latest": items[:5]},
                    backend_status=result.status_code,
                    empty=not items,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def get_status(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        request_id = int(getattr(payload, "request_id"))
        result = await self._find_accessible_document(request_id, context)
        if not result.success:
            return self._read_failure("document.get_status", result)
        item = _sanitize_document_item(result.data)
        status = item.get("statut") or item.get("status") or "statut inconnu"
        label = _document_label(item)
        summary = f"Votre demande {label} est {str(status).replace('_', ' ').lower()}."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="document.get_status",
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

    async def open_document(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        request_id = int(getattr(payload, "request_id"))
        result = await self._find_accessible_document(request_id, context)
        if not result.success:
            return self._read_failure("document.open", result)

        item = _sanitize_document_item(result.data)
        status = str(item.get("statut") or item.get("status") or "").upper()
        if status != "PRET" and not item.get("hasDocument"):
            summary = "Ce document n'est pas encore pret au telechargement."
            return ToolResult.ok(
                {
                    "read_result": build_read_result(
                        tool_name="document.open",
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

        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        download_path = f"/documents/{request_id}/file" if role == "RH" else f"/documents/{request_id}/telecharger"
        data = {**item, "downloadPath": download_path, "downloadApiPath": f"/api/v1{download_path}"}
        summary = "Le document est pret a etre ouvert."
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="document.open",
                    summary=summary,
                    items=[data],
                    count=1,
                    data=data,
                    backend_status=result.status_code,
                    empty=False,
                )
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def rh_generate(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        body = {
            "type": getattr(payload, "type"),
            "label": getattr(payload, "label"),
            "employeNom": getattr(payload, "employe_nom"),
            "employePrenom": getattr(payload, "employe_prenom"),
            "employePoste": getattr(payload, "employe_poste", None),
            "employeDepartement": getattr(payload, "employe_departement", None),
            "dateEntree": getattr(payload, "date_entree", None),
            "moisConcerne": getattr(payload, "mois_concerne", None),
        }
        body = {key: value for key, value in body.items() if value not in (None, "")}
        result = await self.backend_client.post("/documents/rh/generate-ai", context=context, json=body)
        if not result.success:
            return self._write_failure("document.rh_generate", result)
        return ToolResult.ok(
            {
                "kind": "write_result",
                "toolName": "document.rh_generate",
                "summary": "Le contenu du document RH a ete genere.",
                "data": result.data,
                "backendStatus": result.status_code,
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def rh_reject(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        request_id = int(getattr(payload, "request_id"))
        reason = str(getattr(payload, "reason") or "").strip()
        result = await self.backend_client.request(
            "PUT",
            f"/documents/{request_id}/refuser",
            context=context,
            json={"commentaireRH": reason},
        )
        if not result.success:
            return self._write_failure("document.rh_reject", result)
        return ToolResult.ok(
            {
                "kind": "write_result",
                "toolName": "document.rh_reject",
                "summary": "La demande de document a ete refusee.",
                "data": _sanitize_document_item(result.data),
                "backendStatus": result.status_code,
            },
            warnings=result.warnings,
            status_code=result.status_code,
        )

    async def _list_accessible_documents(self, context: CurrentUserContext) -> ToolResult:
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        if role == "RH":
            return await self.backend_client.get("/documents/rh/demandes", context=context)
        return await self.backend_client.get("/documents/mes-demandes", context=context)

    async def _find_accessible_document(self, request_id: int, context: CurrentUserContext) -> ToolResult:
        result = await self._list_accessible_documents(context)
        if not result.success:
            return result
        for item in _as_list(result.data):
            if not isinstance(item, dict):
                continue
            try:
                if int(item.get("id")) == request_id:
                    return ToolResult.ok(item, warnings=result.warnings, status_code=result.status_code)
            except (TypeError, ValueError):
                continue
        return ToolResult.fail(
            "document_not_found",
            "Cette demande de document est introuvable ou inaccessible.",
            status_code=404,
        )

    def _read_failure(self, tool_name: str, result: ToolResult) -> ToolResult:
        message = _clean_document_error(result)
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
                    data=_safe_error_data(result.data),
                    error={"code": result.error_code, "message": message},
                    backend_status=result.status_code,
                    empty=True,
                )
            },
            warnings=result.warnings,
        )

    @staticmethod
    def _write_failure(tool_name: str, result: ToolResult) -> ToolResult:
        message = _clean_document_error(result)
        return ToolResult.fail(
            result.error_code or "backend_error",
            message,
            status_code=result.status_code,
            data={
                "kind": "write_result",
                "toolName": tool_name,
                "summary": message,
                "data": _safe_error_data(result.data),
                "error": {"code": result.error_code, "message": message},
                "backendStatus": result.status_code,
            },
            warnings=result.warnings,
        )


def register_document_tools(registry: ToolRegistry, backend_client: BackendClient) -> DocumentTools:
    tools = DocumentTools(backend_client)
    tools.register(registry)
    return tools


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("items", "content", "data", "documents", "demandes"):
            nested = value.get(key)
            if isinstance(nested, list):
                return nested
    return []


def _clean_optional(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_document_type(value: Any) -> str | None:
    text = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    if not text:
        return None
    aliases = {
        "WORK_CERTIFICATE": "ATTESTATION_TRAVAIL",
        "CERTIFICATE": "ATTESTATION_TRAVAIL",
        "ATTESTATION": "ATTESTATION_TRAVAIL",
        "ATTESTATION_DE_TRAVAIL": "ATTESTATION_TRAVAIL",
        "PAYSLIP": "BULLETIN_PAIE",
        "PAY_SLIP": "BULLETIN_PAIE",
        "FICHE_DE_PAIE": "BULLETIN_PAIE",
        "SALARY_CERTIFICATE": "ATTESTATION_SALAIRE",
        "ATTESTATION_DE_SALAIRE": "ATTESTATION_SALAIRE",
    }
    return aliases.get(text, text)


def _sanitize_document_item(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    sanitized = dict(value)
    document_url = sanitized.pop("documentUrl", None)
    sanitized.pop("storageKey", None)
    sanitized.pop("filePath", None)
    sanitized.pop("path", None)
    sanitized["hasDocument"] = bool(document_url) or bool(sanitized.get("hasDocument"))
    return sanitized


def _safe_error_data(value: Any) -> Any:
    if isinstance(value, dict):
        return _sanitize_document_item(value)
    if isinstance(value, list):
        return [_sanitize_document_item(item) for item in value]
    return value


def _document_label(item: dict[str, Any]) -> str:
    label = item.get("label") or item.get("type") or "de document"
    text = str(label).replace("_", " ").lower()
    return f"{text}"


def _document_list_summary(items: list[Any]) -> str:
    counts = _status_counts(items)
    if not counts:
        return f"Vous avez {len(items)} demande(s) de documents."
    ready = counts.get("PRET", 0)
    in_progress = counts.get("EN_COURS", 0) + counts.get("EN_ATTENTE", 0)
    refused = counts.get("REFUSE", 0)
    parts = []
    if in_progress:
        parts.append(f"{in_progress} en cours")
    if ready:
        parts.append(f"{ready} prete(s)")
    if refused:
        parts.append(f"{refused} refusee(s)")
    if not parts:
        parts = [f"{count} {status.replace('_', ' ').lower()}" for status, count in sorted(counts.items())]
    return f"Vous avez {len(items)} demande(s) de documents : " + ", ".join(parts) + "."


def _status_counts(items: list[Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        status = str(item.get("statut") or item.get("status") or "INCONNU").upper()
        counts[status] = counts.get(status, 0) + 1
    return counts


def _clean_document_error(result: ToolResult) -> str:
    message = (result.error_message or "").strip()
    lower = message.lower()
    if result.status_code == 409 or "deja" in lower or "déjà" in lower or "conflict" in lower:
        return "Une demande de ce type est deja en cours de traitement."
    if result.status_code in (401, 403):
        return "Vous n'avez pas les droits necessaires pour acceder a ce document."
    if result.status_code == 404:
        return "Le document demande est introuvable ou indisponible."
    if result.status_code == 400:
        return message or "La demande de document est incomplete."
    if result.status_code is None or result.status_code >= 500:
        return "Le service documents est momentanement indisponible. Reessayez dans quelques instants."
    return message or "Impossible de traiter cette demande de document."
