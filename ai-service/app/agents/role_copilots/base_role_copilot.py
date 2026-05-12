from __future__ import annotations

from abc import abstractmethod
from typing import Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult, get_read_result

from ..base_domain_agent import DomainAgent

UNAVAILABLE_CODES = {
    "tool_not_found",
    "capability_unavailable",
    "legacy_tools_unavailable",
    "backend_unavailable",
    "read_tool_failed",
}


class BaseRoleCopilot(DomainAgent):
    name = "RoleCopilot"
    allowed_roles: set[str] = set()

    def __init__(self, executor: ToolExecutor) -> None:
        self.executor = executor

    def can_handle(self, message: str, context: CurrentUserContext, route_result: Any | None = None) -> float:
        if not self._role_allowed(context):
            return 0.0
        _intent, confidence = self.detect_intent(message, context)
        return confidence

    async def handle(self, message: str, context: CurrentUserContext, route_result: Any | None = None) -> AgentResponse:
        if not self._role_allowed(context):
            return AgentResponse(
                type="error",
                text="Votre role ne permet pas d'utiliser ce copilot.",
                intent=f"{self.name}.forbidden",
                confidence=0.95,
            )
        intent, confidence = self.detect_intent(message, context)
        if intent.endswith("what_can_i_do"):
            capabilities = self.summarize_capabilities(context)
            return AgentResponse(
                type="answer",
                text="Je peux vous aider avec: " + "; ".join(capabilities) + ".",
                intent=intent,
                confidence=confidence,
                actionResult={
                    "kind": "role_summary",
                    "agent": self.name,
                    "sections": [
                        {
                            "title": "Capacites",
                            "summary": "; ".join(capabilities),
                            "status": "ok",
                            "items": capabilities,
                        }
                    ],
                    "warnings": [],
                },
            )
        return await self.build_daily_briefing(context, intent=intent, confidence=confidence)

    @abstractmethod
    def detect_intent(self, message: str, context: CurrentUserContext) -> tuple[str, float]:
        raise NotImplementedError

    @abstractmethod
    def summarize_capabilities(self, context: CurrentUserContext) -> list[str]:
        raise NotImplementedError

    @abstractmethod
    async def build_daily_briefing(
        self,
        context: CurrentUserContext,
        *,
        intent: str,
        confidence: float,
    ) -> AgentResponse:
        raise NotImplementedError

    async def _read_section(
        self,
        *,
        title: str,
        tool_name: str,
        context: CurrentUserContext,
        payload: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], ToolCallRecord, list[str]]:
        result = await self.executor.execute(tool_name, payload or {}, context)
        section = self._section_from_result(title=title, tool_name=tool_name, result=result)
        call = ToolCallRecord(name=tool_name, arguments=payload or {}, status="success" if result.success else "failed")
        warnings = list(result.warnings or [])
        if not result.success:
            warnings.append(section["summary"])
        return section, call, warnings

    def _section_from_result(self, *, title: str, tool_name: str, result: ToolResult) -> dict[str, Any]:
        read_result = get_read_result(result.data)
        if read_result:
            summary = str(read_result.get("summary") or self._default_summary(result))
            items = read_result.get("items") if isinstance(read_result.get("items"), list) else []
            status = "ok" if result.success else self._failure_status(result)
            return {
                "title": title,
                "summary": summary,
                "status": status,
                "items": items,
                "toolName": tool_name,
            }
        if result.success:
            return {
                "title": title,
                "summary": self._summarize_payload(result.data),
                "status": "ok",
                "items": [],
                "toolName": tool_name,
            }
        return {
            "title": title,
            "summary": self._default_summary(result),
            "status": self._failure_status(result),
            "items": [],
            "toolName": tool_name,
        }

    def _role_response(
        self,
        *,
        intent: str,
        confidence: float,
        headline: str,
        sections: list[dict[str, Any]],
        warnings: list[str],
        tool_calls: list[ToolCallRecord],
    ) -> AgentResponse:
        text_lines = [headline]
        for section in sections:
            text_lines.append(f"- {section['title']}: {section['summary']}")
        unique_warnings = _dedupe(warnings)
        if unique_warnings:
            text_lines.append("Certaines donnees sont indisponibles; le resume reste partiel.")
        return AgentResponse(
            type="answer",
            text="\n".join(text_lines),
            intent=intent,
            confidence=confidence,
            toolCalls=tool_calls,
            actionResult={
                "kind": "role_summary",
                "agent": self.name,
                "sections": sections,
                "warnings": unique_warnings,
            },
        )

    def _role_allowed(self, context: CurrentUserContext) -> bool:
        role = (context.role or "EMPLOYEE").upper().replace("ROLE_", "")
        return not self.allowed_roles or role in {item.upper() for item in self.allowed_roles}

    @staticmethod
    def _failure_status(result: ToolResult) -> str:
        if result.error_code in UNAVAILABLE_CODES or result.status_code in (404, 503):
            return "unavailable"
        return "warning"

    @staticmethod
    def _default_summary(result: ToolResult) -> str:
        if result.error_code == "forbidden_role" or result.status_code == 403:
            return "Vous n'avez pas les droits necessaires pour consulter cette section."
        if result.error_code == "tool_not_found":
            return "Cette capacite n'est pas encore disponible."
        return result.error_message or "Cette section est momentanement indisponible."

    @staticmethod
    def _summarize_payload(data: Any) -> str:
        if isinstance(data, dict):
            for key in ("summary", "text", "message"):
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            return "Donnees disponibles depuis le backend."
        if isinstance(data, list):
            return "Aucun element trouve." if not data else f"{len(data)} element(s) retrouve(s)."
        return "Donnees disponibles." if data not in (None, "", [], {}) else "Aucune donnee disponible."


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        output.append(text)
    return output
