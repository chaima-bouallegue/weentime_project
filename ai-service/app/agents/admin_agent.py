from __future__ import annotations

import re
from typing import Any

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult, get_read_result

from .base_domain_agent import DomainAgent
from .hr_agent_utils import ConfirmationMixin
from .response_composer import compose_read_response


class AdminAgent(ConfirmationMixin, DomainAgent):
    name = "admin"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        if (context.role or "").upper().replace("ROLE_", "") != "ADMIN":
            return 0.0
        intent, confidence = self.detect_intent(message, context)
        return confidence if intent else 0.0

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        if (context.role or "").upper().replace("ROLE_", "") != "ADMIN":
            return AgentResponse(type="error", text="Votre role ne permet pas les actions admin.", intent="admin.forbidden", confidence=0.95)

        intent, confidence = self.detect_intent(message, context)
        if intent == "admin.list_users":
            return await self._read("admin.list_users", {}, context, intent, "Voici les utilisateurs.", confidence)
        if intent == "admin.list_enterprises":
            return await self._read("admin.list_enterprises", {}, context, intent, "Voici les entreprises.", confidence)
        if intent == "admin.misconfigured_users":
            return await self._read("admin.misconfigured_users", {}, context, intent, "Voici les utilisateurs potentiellement mal configures.", confidence)
        if intent == "admin.system_health":
            return await self._read("admin.system_health", {}, context, intent, "Etat systeme minimal disponible.", confidence)
        if intent == "admin.summary":
            return await self._summary(context, intent=intent, confidence=confidence)
        if intent == "admin.create_user":
            payload = self._extract_create_user(message)
            missing = [label for label, value in payload.items() if label in {"first_name", "last_name", "email", "password", "role", "company_id"} and value in (None, "")]
            if missing:
                return AgentResponse(
                    type="ask",
                    text="Pour creer un utilisateur, il me faut prenom, nom, email, mot de passe, role et entreprise.",
                    intent=intent,
                    confidence=confidence,
                )
            return self.confirmation_response(
                context=context,
                tool_name="admin.create_user",
                tool_input=payload,
                intent=intent,
                text="Confirmez-vous la creation de cet utilisateur ?",
                confidence=confidence,
            )
        if intent == "admin.update_role":
            user_id = _extract_int_after(message, ("user", "utilisateur", "id"))
            role = _extract_role(message)
            if not user_id or not role:
                return AgentResponse(type="ask", text="Precisez l'identifiant utilisateur et le nouveau role.", intent=intent, confidence=confidence)
            return self.confirmation_response(
                context=context,
                tool_name="admin.update_user_role",
                tool_input={"user_id": user_id, "role": role},
                intent=intent,
                text=f"Confirmez-vous le remplacement du role par {role} ?",
                confidence=confidence,
            )
        if intent == "admin.assign_manager":
            user_id = _extract_int_after(message, ("user", "utilisateur", "employee", "employe"))
            manager_id = _extract_int_after(message, ("manager", "responsable"))
            if not user_id or not manager_id:
                return AgentResponse(type="ask", text="Precisez l'identifiant utilisateur et l'identifiant manager.", intent=intent, confidence=confidence)
            return self.confirmation_response(
                context=context,
                tool_name="admin.assign_manager",
                tool_input={"user_id": user_id, "manager_id": manager_id},
                intent=intent,
                text="Confirmez-vous cette assignation manager ?",
                confidence=confidence,
            )
        if intent == "admin.assign_rh":
            rh_user_id = _extract_int_after(message, ("rh", "hr"))
            entreprise_id = _extract_int_after(message, ("entreprise", "company"))
            if not rh_user_id or not entreprise_id:
                return AgentResponse(type="ask", text="Precisez l'identifiant RH et l'identifiant entreprise.", intent=intent, confidence=confidence)
            return self.confirmation_response(
                context=context,
                tool_name="admin.assign_rh_owner",
                tool_input={"rh_user_id": rh_user_id, "entreprise_id": entreprise_id},
                intent=intent,
                text="Confirmez-vous cette assignation RH a l'entreprise ?",
                confidence=confidence,
            )
        return AgentResponse(type="ask", text="Que souhaitez-vous administrer ?", intent="admin.unknown", confidence=0.35)

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str | None, float]:
        text = (message or "").lower()
        if _has_arabic(text):
            if any(term in text for term in ("المستخدم", "مستخدم")):
                return "admin.list_users", 0.86
            return "admin.summary", 0.84
        if any(term in text for term in ("cree", "create")) and any(term in text for term in ("utilisateur", "user")):
            return "admin.create_user", 0.93
        if "role" in text and any(term in text for term in ("change", "update", "modifier", "remplace", "replace")):
            return "admin.update_role", 0.92
        if any(term in text for term in ("assign", "assigne", "affecte")) and any(term in text for term in ("manager", "responsable")):
            return "admin.assign_manager", 0.92
        if any(term in text for term in ("assign", "assigne", "affecte")) and any(term in text for term in ("rh", "hr")):
            return "admin.assign_rh", 0.91
        if any(term in text for term in ("mal configure", "mal configures", "misconfigured")):
            return "admin.misconfigured_users", 0.91
        if any(term in text for term in ("utilisateurs", "users", "show users", "liste users")):
            return "admin.list_users", 0.88
        if any(term in text for term in ("entreprises", "companies", "company list")):
            return "admin.list_enterprises", 0.88
        if any(term in text for term in ("health", "sante", "sante systeme", "etat systeme")):
            return "admin.system_health", 0.86
        if any(term in text for term in ("resume systeme", "system summary", "dashboard admin", "systeme", "que dois-je verifier")):
            return "admin.summary", 0.97
        return None, 0.0

    async def _read(self, tool_name: str, payload: dict[str, Any], context: CurrentUserContext, intent: str, fallback_text: str, confidence: float) -> AgentResponse:
        result = await self.executor.execute(tool_name, payload, context)
        response = compose_read_response(intent, result, fallback_text=fallback_text, confidence=confidence)
        response.toolCalls = [ToolCallRecord(name=tool_name, arguments=payload, status="success" if result.success else "failed")]
        return response

    async def _summary(self, context: CurrentUserContext, *, intent: str, confidence: float) -> AgentResponse:
        sections: list[dict[str, Any]] = []
        warnings: list[str] = []
        calls: list[ToolCallRecord] = []
        for title, tool_name in (
            ("Sante systeme", "admin.system_health"),
            ("Utilisateurs", "admin.list_users"),
            ("Entreprises", "admin.list_enterprises"),
            ("Configurations", "admin.misconfigured_users"),
        ):
            result = await self.executor.execute(tool_name, {}, context)
            read_result = get_read_result(result.data)
            summary = str(read_result.get("summary") if read_result else (result.error_message or "Section indisponible."))
            status = "ok" if result.success else "unavailable"
            items = read_result.get("items", []) if isinstance(read_result, dict) else []
            sections.append({"title": title, "summary": summary, "status": status, "items": items, "toolName": tool_name})
            calls.append(ToolCallRecord(name=tool_name, arguments={}, status="success" if result.success else "failed"))
            if not result.success:
                warnings.append(summary)
        lines = ["Resume systeme administrateur."] + [f"- {section['title']}: {section['summary']}" for section in sections]
        if warnings:
            lines.append("Certaines sections admin sont indisponibles; le resume reste partiel.")
        return AgentResponse(
            type="answer",
            text="\n".join(lines),
            intent=intent,
            confidence=confidence,
            toolCalls=calls,
            actionResult={"kind": "role_summary", "agent": "AdminAgent", "sections": sections, "warnings": warnings},
        )

    @staticmethod
    def _extract_create_user(message: str) -> dict[str, Any]:
        text = message or ""
        email_match = re.search(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", text)
        email = email_match.group(0) if email_match else None
        role = _extract_role(text)
        company_id = _extract_int_after(text, ("company", "entreprise"))
        password_match = re.search(r"(?:password|mot de passe|mdp)\s+([^\s,;]+)", text, flags=re.IGNORECASE)
        password = password_match.group(1) if password_match else None
        name_match = re.search(r"(?:pour|for|user|utilisateur)\s+([A-Za-z'-]+)(?:\s+([A-Za-z'-]+))?", text, flags=re.IGNORECASE)
        first_name = name_match.group(1) if name_match else None
        last_name = name_match.group(2) if name_match and name_match.group(2) else None
        if first_name and not last_name:
            last_name = "Utilisateur"
        return {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "password": password,
            "role": role,
            "status": "ACTIVE",
            "company_id": company_id,
        }


def _extract_role(message: str) -> str | None:
    text = (message or "").upper().replace("ROLE_", "")
    for role in ("ADMIN", "RH", "MANAGER", "EMPLOYEE"):
        if role in text:
            return role
    if "EMPLOYE" in text or "EMPLOYEE" in text:
        return "EMPLOYEE"
    return None


def _extract_int_after(message: str, markers: tuple[str, ...]) -> int | None:
    text = message or ""
    for marker in markers:
        match = re.search(rf"{re.escape(marker)}\D+(\d+)", text, flags=re.IGNORECASE)
        if match:
            return int(match.group(1))
    numbers = re.findall(r"\d+", text)
    return int(numbers[0]) if len(numbers) == 1 else None


def _has_arabic(value: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" for char in value)
