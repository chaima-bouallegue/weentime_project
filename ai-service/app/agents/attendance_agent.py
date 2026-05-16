from __future__ import annotations

import re
import unicodedata

from app.context.current_user import CurrentUserContext
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult

from .base_domain_agent import DomainAgent
from .response_composer import compact_value, compose_tool_error


class AttendanceAgent(DomainAgent):
    name = "attendance"

    def __init__(self, executor: ToolExecutor, confirmation_store: ConfirmationStore) -> None:
        self.executor = executor
        self.confirmation_store = confirmation_store

    def can_handle(self, message: str, context: CurrentUserContext) -> float:
        return self.detect_intent(message, context)[1]

    async def handle(self, message: str, context: CurrentUserContext) -> AgentResponse:
        intent, confidence = self.detect_intent(message, context)
        if intent == "attendance.status":
            result = await self.executor.execute("get_pointage_status", {}, context)
            return self._status_response(result, confidence)
        if intent == "attendance.check_in":
            return self._confirmation_response("check_in", "Confirmez-vous le pointage d'entree ?", intent, confidence, context)
        if intent == "attendance.check_out":
            return self._confirmation_response("check_out", "Confirmez-vous le pointage de sortie ?", intent, confidence, context)
        if intent == "attendance.week_hours":
            result = await self.executor.execute("get_week_hours", {}, context)
            return self._week_hours_response(result, confidence)
        if intent == "attendance.team_presence":
            result = await self.executor.execute("get_team_presence", {}, context)
            return self._team_presence_response(result, confidence)
        return AgentResponse(
            type="ask",
            text="Je peux vous aider sur le pointage. Voulez-vous connaitre votre statut, pointer l'entree ou pointer la sortie ?",
            intent="attendance.unknown",
            confidence=confidence,
        )

    def detect_intent(self, message: str, context: CurrentUserContext | None = None) -> tuple[str, float]:
        text = self._normalize(message)
        if not text:
            return "attendance.unknown", 0.0

        has_attendance_word = any(term in text for term in ("pointage", "pointe", "pointer", "presence", "present", "attendance"))
        if any(term in text for term in ("je veux pointer", "veux pointer", "souhaite pointer", "nheb npointi", "npointi", "أريد تسجيل الحضور", "اريد تسجيل الحضور")):
            return "attendance.unknown", 0.91
        if any(term in text for term in ("pointer mon entree", "pointe mon entree", "check in", "check me in", "clock in", "arrivee", "j arrive", "je commence", "checked in")):
            return "attendance.check_in", 0.94
        if any(term in text for term in ("pointer ma sortie", "pointe ma sortie", "check out", "clock out", "depart", "je pars", "sortie")):
            return "attendance.check_out", 0.94
        if any(term in text for term in ("semaine", "week")) and any(term in text for term in ("heure", "heures", "hours", "temps")):
            return "attendance.week_hours", 0.88
        if any(term in text for term in ("equipe", "team")) and any(term in text for term in ("retard", "present", "absent", "presence")):
            return "attendance.team_presence", 0.88
        # Collective presence prompts ("presence aujourd'hui", "presence equipe")
        # only make sense for roles with team/company visibility. Without a role
        # check we'd route an Employee's "presence aujourd'hui" here and the
        # tool would 403; keep it role-aware.
        role = ((context.role if context is not None else "EMPLOYEE") or "EMPLOYEE").upper().replace("ROLE_", "")
        if role in {"MANAGER", "RH", "ADMIN"} and any(
            phrase in text for phrase in (
                "presence aujourd",
                "presence du jour",
                "presence equipe",
                "pointage equipe",
                "chkoun ma pointach",
                "qui est present",
                "qui est absent",
            )
        ):
            return "attendance.team_presence", 0.92
        if has_attendance_word or re.search(r"\best ce que je suis\b", text):
            return "attendance.status", 0.86
        if any(term in text for term in ("mes heures", "heures travaillees", "heures aujourd")):
            return "attendance.status", 0.72
        return "attendance.unknown", 0.0

    def _confirmation_response(
        self,
        tool_name: str,
        text: str,
        intent: str,
        confidence: float,
        context: CurrentUserContext,
    ) -> AgentResponse:
        record = self.confirmation_store.create(context, tool_name, {})
        return AgentResponse(
            type="confirm_action",
            text=text,
            intent=intent,
            confidence=confidence,
            requiresConfirmation=True,
            confirmationId=record.confirmation_id,
            toolCalls=[ToolCallRecord(name=tool_name, arguments={}, status="pending_confirmation")],
        )

    def _status_response(self, result: ToolResult, confidence: float) -> AgentResponse:
        if not result.success:
            return compose_tool_error("attendance.status", result)
        data = result.data if isinstance(result.data, dict) else {}
        status = data.get("status") or data.get("sessionStatus") or data.get("etat") or data.get("state")
        active = data.get("active") or data.get("sessionOpen") or data.get("activeSession")
        check_in = data.get("checkIn") or data.get("check_in") or data.get("heureEntree") or data.get("entryTime")
        check_out = data.get("checkOut") or data.get("check_out") or data.get("heureSortie") or data.get("exitTime")
        if active is True and not status:
            status = "ACTIVE"
        text = f"Statut de pointage: {compact_value(status)}. Entree: {compact_value(check_in)}. Sortie: {compact_value(check_out)}."
        return AgentResponse(
            type="answer",
            text=text,
            intent="attendance.status",
            confidence=confidence,
            toolCalls=[ToolCallRecord(name="get_pointage_status", status="success")],
            actionResult=result.model_dump(mode="json"),
        )

    def _week_hours_response(self, result: ToolResult, confidence: float) -> AgentResponse:
        if not result.success:
            return compose_tool_error("attendance.week_hours", result)
        data = result.data if isinstance(result.data, dict) else {}
        hours = data.get("weekHours") or data.get("heuresSemaine") or data.get("totalWeekHours") or data.get("totalHours")
        text = f"Heures de la semaine: {compact_value(hours)}."
        return AgentResponse(
            type="answer",
            text=text,
            intent="attendance.week_hours",
            confidence=confidence,
            toolCalls=[ToolCallRecord(name="get_week_hours", status="success")],
            actionResult=result.model_dump(mode="json"),
        )

    def _team_presence_response(self, result: ToolResult, confidence: float) -> AgentResponse:
        if not result.success:
            return compose_tool_error("attendance.team_presence", result)
        data = result.data
        text = "Vue de presence recuperee depuis le backend."
        if isinstance(data, dict):
            scope = data.get("scope") or data.get("view") or ("GLOBAL" if "presentToday" in data else "COLLECTIVE")
            presents = data.get("presentMembers") or data.get("presents") or data.get("presentCount") or data.get("presentToday")
            absents = data.get("absentMembers") or data.get("absents") or data.get("absentCount") or data.get("absentToday")
            late = data.get("lateMembers") or data.get("late") or data.get("retards") or data.get("lateCount") or data.get("lateToday")
            total = data.get("totalMembers") or data.get("totalTrackedUsers")
            text = (
                f"Presence {compact_value(scope).lower()} aujourd'hui: "
                f"total {compact_value(total)}, presents {compact_value(presents)}, "
                f"absents {compact_value(absents)}, retards {compact_value(late)}."
            )
        return AgentResponse(
            type="answer",
            text=text,
            intent="attendance.team_presence",
            confidence=confidence,
            toolCalls=[ToolCallRecord(name="get_team_presence", status="success")],
            actionResult=result.model_dump(mode="json"),
        )

    @staticmethod
    def _normalize(value: str) -> str:
        text = unicodedata.normalize("NFKD", value or "")
        text = "".join(char for char in text if not unicodedata.combining(char))
        return text.lower().strip()
