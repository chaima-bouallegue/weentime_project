from __future__ import annotations

from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import get_read_result

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin, extract_payload, has_any
from .response_composer import compose_tool_error


DOCUMENT_TERMS = (
    "document",
    "attestation",
    "certificat",
    "certificate",
    "work certificate",
    "salary certificate",
    "bulletin",
    "fiche de paie",
    "fiche de poste",
    "payslip",
    "pay slip",
    # Specific document types — needed so prompts like "contrat de travail"
    # or "bulletin de paie" fire DocumentAgent even when the user doesn't
    # use the generic "document" / "demande de document" wording.
    "contrat",
    "contract",
    "anciennete",
    "ancienneté",
    "وثيقة",
    "وثائقي",
    "مستند",
    "شهادة",
    "كشف الراتب",
    "راتب",
)


class DocumentAgent(ConfirmationMixin, DomainAgent):
    name = "document"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        source_text = _source_text(message, context)
        if intent == "document.list":
            return await self._list_documents(context, intent=intent, confidence=confidence)
        if intent == "document.status":
            payload = extract_payload(source_text, "OPEN_DOCUMENT", context)
            request_id = payload.get("request_id")
            if request_id:
                return await self.read_response(
                    tool_name="document.get_status",
                    tool_input={"request_id": request_id},
                    context=context,
                    intent=intent,
                    success_text="Voici le statut de cette demande de document.",
                    confidence=confidence,
                )
            return await self.read_response(
                tool_name="document.list_my_requests",
                tool_input={},
                context=context,
                intent="document.list",
                success_text="Voici vos demandes de documents.",
                confidence=confidence,
            )
        if intent == "document.open":
            payload = extract_payload(source_text, "OPEN_DOCUMENT", context)
            request_id = payload.get("request_id")
            if not request_id:
                return AgentResponse(type="ask", text="Quel document souhaitez-vous ouvrir ?", intent=intent, confidence=confidence)
            return await self.read_response(
                tool_name="document.open",
                tool_input={"request_id": request_id},
                context=context,
                intent=intent,
                success_text="Le document est pret.",
                confidence=confidence,
            )
        if intent == "document.create":
            # Pre-flight role check. `document.create_request` is registered with
            # allowed_roles={"EMPLOYEE"} in document_tools.py — the registry will
            # deny non-EMPLOYEE callers at execution time, but if we still offered
            # a confirm_action here the user would see the confirm dialog then
            # get a 401/403 on accept. That's bad UX and what RH-AGENT-HOTFIX-01
            # called out. Refuse upfront with a capability message instead.
            caller_role = (context.role or "").upper().replace("ROLE_", "")
            if caller_role and caller_role != "EMPLOYEE":
                return AgentResponse(
                    type="answer",
                    text=(
                        "La demande de document est une action employe. "
                        f"En tant que {caller_role}, utilisez plutot 'charge documents RH' "
                        "pour voir le backlog, ou 'generer document' pour produire un document RH."
                    ),
                    intent=intent,
                    confidence=confidence,
                    actionResult={
                        "kind": "capability_unavailable",
                        "agent": "DocumentAgent",
                        "capability": "document.create_request",
                        "allowedRoles": ["EMPLOYEE"],
                        "callerRole": caller_role,
                        "alternatives": [
                            "charge documents RH (document.rh_workload)",
                            "generer document RH (document.rh_generate)",
                        ],
                    },
                )
            payload = extract_payload(source_text, "REQUEST_DOCUMENT", context)
            document_type = payload.get("document_type") or _infer_document_type(source_text)
            if not document_type:
                return AgentResponse(
                    type="ask",
                    text="Quel type de document souhaitez-vous demander ?",
                    intent=intent,
                    confidence=confidence,
                )
            label = _document_type_label(document_type)
            return self.confirmation_response(
                context=context,
                tool_name="document.create_request",
                tool_input={
                    "document_type": document_type,
                    "reason": payload.get("reason"),
                    "month": payload.get("month"),
                },
                intent=intent,
                text=f"Voulez-vous confirmer la demande de {label} ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Quel document souhaitez-vous gerer ?", intent="document.unknown", confidence=0.35)

    async def _list_documents(self, context: CurrentUserContext, *, intent: str, confidence: float) -> AgentResponse:
        result = await self.executor.execute("document.list_my_requests", {}, context)
        if not result.success:
            response = compose_tool_error(intent, result)
            response.toolCalls = [ToolCallRecord(name="document.list_my_requests", arguments={}, status="failed")]
            return response

        read_result = get_read_result(result.data)
        if not read_result:
            return AgentResponse(
                type="answer",
                text="Voici vos demandes de documents.",
                intent=intent,
                confidence=confidence,
                toolCalls=[ToolCallRecord(name="document.list_my_requests", arguments={}, status="success")],
                actionResult=result.model_dump(mode="json"),
            )

        items = read_result.get("items") if isinstance(read_result.get("items"), list) else []
        count = int(read_result.get("count") or len(items))
        if count == 0:
            text = str(read_result.get("summary") or "Aucun document trouve.")
        else:
            lines = [f"Vous avez {count} demande(s) de documents :"]
            for status, status_count in sorted(_status_counts(items).items()):
                lines.append(f"- {status_count} {status.replace('_', ' ').lower()}")
            latest = items[:5]
            if latest:
                lines.append("Dernieres demandes :")
                for index, item in enumerate(latest, start=1):
                    lines.append(f"{index}. {_document_item_label(item)}")
            lines.append("Voulez-vous ouvrir un document specifique ?")
            text = "\n".join(lines)

        return AgentResponse(
            type="answer",
            text=text,
            intent=intent,
            confidence=confidence,
            toolCalls=[ToolCallRecord(name="document.list_my_requests", arguments={}, status="success")],
            actionResult=result.model_dump(mode="json"),
        )

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = _source_text(message, context).lower()
        if not has_any(text, DOCUMENT_TERMS):
            return None, 0.0
        if has_any(text, ("ouvrir", "open", "telecharger", "télécharger", "download")):
            return "document.open", 0.9
        if has_any(text, ("statut", "status", "suivi", "etat", "état")):
            return "document.status", 0.84
        if has_any(text, ("mes documents", "mes demandes", "montre", "show", "list", "liste", "historique", "اعرض", "وثائقي")):
            return "document.list", 0.84
        if has_any(text, ("demande", "demander", "je veux", "je voudrais", "request", "need", "i need", "want", "أريد", "اريد", "نحب")):
            return "document.create", 0.9
        return "document.create", 0.72


def _source_text(message: str, context: CurrentUserContext | None) -> str:
    original = ""
    if context is not None:
        original_value = context.metadata.get("original_text") if isinstance(context.metadata, dict) else None
        original = str(original_value or "")
    if original and original != message:
        return f"{message or ''} {original}".strip()
    return message or ""


def _infer_document_type(message: str) -> str | None:
    text = (message or "").lower()
    if has_any(text, ("bulletin", "paie", "payslip", "pay slip", "fiche de paie", "كشف الراتب", "راتب")):
        return "BULLETIN_PAIE"
    if has_any(text, ("salaire", "salary certificate", "attestation salaire")):
        return "ATTESTATION_SALAIRE"
    if has_any(text, ("travail", "work certificate", "attestation", "certificate", "شهادة عمل", "عمل")):
        return "ATTESTATION_TRAVAIL"
    if has_any(text, ("contrat", "contract")):
        return "CONTRAT_TRAVAIL"
    if has_any(text, ("anciennete", "ancienneté")):
        return "ATTESTATION_ANCIENNETE"
    if has_any(text, ("fiche de poste", "poste")):
        return "FICHE_POSTE"
    return None


def _document_type_label(document_type: Any) -> str:
    value = str(document_type or "document").upper()
    labels = {
        "ATTESTATION_TRAVAIL": "l'attestation de travail",
        "BULLETIN_PAIE": "bulletin de paie",
        "ATTESTATION_SALAIRE": "l'attestation de salaire",
        "CONTRAT_TRAVAIL": "contrat de travail",
        "CERTIFICAT_CONGE": "certificat de conge",
        "ATTESTATION_ANCIENNETE": "l'attestation d'anciennete",
        "FICHE_POSTE": "fiche de poste",
    }
    return labels.get(value, "ce document")


def _status_counts(items: list[object]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        status = str(item.get("statut") or item.get("status") or "INCONNU").upper()
        counts[status] = counts.get(status, 0) + 1
    return counts or {"INCONNU": len(items)}


def _document_item_label(item: object) -> str:
    if not isinstance(item, dict):
        return str(item)
    label = item.get("label") or item.get("type") or item.get("documentType") or "Document"
    status = item.get("statut") or item.get("status") or "statut inconnu"
    date = item.get("dateDemande") or item.get("createdAt") or item.get("created_at") or item.get("date")
    parts = [str(label).replace("_", " ").title(), str(status).replace("_", " ").lower()]
    if date:
        parts.append(str(date)[:10])
    return " - ".join(parts)
