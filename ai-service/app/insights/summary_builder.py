from __future__ import annotations

from .insight_models import InsightReport


def build_report_text(report: InsightReport) -> str:
    lines = [report.summary]
    for insight in report.insights:
        lines.append(f"- {insight.title}: {insight.summary}")
    if report.warnings:
        lines.append("Certaines donnees sont indisponibles; les suggestions restent partielles.")
    return "\n".join(lines)
