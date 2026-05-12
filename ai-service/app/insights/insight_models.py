from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

Severity = Literal["info", "warning", "critical"]


@dataclass(slots=True)
class Insight:
    id: str
    type: str
    severity: Severity
    title: str
    summary: str
    evidence: dict[str, Any]
    confidence: float
    source_tools: list[str]
    recommended_actions: list[str] = field(default_factory=list)
    requires_confirmation: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "title": self.title,
            "summary": self.summary,
            "evidence": self.evidence,
            "confidence": self.confidence,
            "sourceTools": self.source_tools,
            "recommendedActions": self.recommended_actions,
            "requiresConfirmation": self.requires_confirmation,
        }


@dataclass(slots=True)
class InsightReport:
    role: str
    tenant_id: int | None
    period: str
    insights: list[Insight]
    warnings: list[str] = field(default_factory=list)
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def summary(self) -> str:
        if not self.insights:
            if self.warnings:
                return "Aucune anomalie fiable detectee; certaines donnees sont indisponibles."
            return "Aucune anomalie detectee avec les donnees disponibles."
        critical = sum(1 for item in self.insights if item.severity == "critical")
        warnings = sum(1 for item in self.insights if item.severity == "warning")
        infos = sum(1 for item in self.insights if item.severity == "info")
        parts = []
        if critical:
            parts.append(f"{critical} critique(s)")
        if warnings:
            parts.append(f"{warnings} alerte(s)")
        if infos:
            parts.append(f"{infos} information(s)")
        return "Rapport intelligent: " + ", ".join(parts) + "."

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "insight_report",
            "role": self.role,
            "tenantId": self.tenant_id,
            "period": self.period,
            "generatedAt": self.generated_at.isoformat(),
            "summary": self.summary,
            "insights": [item.to_dict() for item in self.insights],
            "warnings": self.warnings,
        }
