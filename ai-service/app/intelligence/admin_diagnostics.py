from __future__ import annotations

import importlib.util
import re
from dataclasses import dataclass, field
from typing import Any

from config import get_settings

from app.events.publisher import get_redis_event_status
from app.observability.monitoring import build_ai_monitoring_snapshot

from .priority_engine import PriorityItem


@dataclass(frozen=True, slots=True)
class AdminDiagnosticItem:
    id: str
    type: str
    severity: str
    title: str
    summary: str
    evidence: dict[str, Any]
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
            "evidence": redact_secrets(self.evidence),
            "sourceTools": self.source_tools,
            "recommendedActions": self.recommended_actions,
            "requiresConfirmation": self.requires_confirmation,
        }


class AdminDiagnostics:
    """Build deterministic, read-only admin diagnostics from safe sources."""

    def build_admin_diagnostics(
        self,
        sections: list[dict[str, Any]],
        *,
        runtime_status: dict[str, Any] | None = None,
    ) -> list[AdminDiagnosticItem]:
        diagnostics: list[AdminDiagnosticItem] = []
        by_tool = {str(section.get("toolName") or ""): section for section in sections}

        diagnostics.extend(self._governance_diagnostics(by_tool))
        diagnostics.extend(self._unavailable_section_diagnostics(sections))
        diagnostics.extend(self._runtime_diagnostics(runtime_status or collect_admin_runtime_status()))
        return _dedupe_diagnostics(diagnostics)

    def diagnostics_to_priorities(self, diagnostics: list[AdminDiagnosticItem]) -> list[PriorityItem]:
        priorities: list[PriorityItem] = []
        for item in diagnostics:
            if item.severity not in {"warning", "critical"}:
                continue
            priorities.append(
                PriorityItem(
                    id=item.id,
                    type=item.type,
                    severity=item.severity,
                    title=item.title,
                    summary=item.summary,
                    evidence=item.to_dict()["evidence"],
                    source_tools=item.source_tools,
                    recommended_actions=item.recommended_actions,
                    requires_confirmation=False,
                )
            )
        return priorities

    def _governance_diagnostics(self, by_tool: dict[str, dict[str, Any]]) -> list[AdminDiagnosticItem]:
        diagnostics: list[AdminDiagnosticItem] = []
        misconfigured = by_tool.get("admin.misconfigured_users")
        if misconfigured and str(misconfigured.get("status")) == "ok":
            count = _count_from_section(misconfigured)
            severity = "warning" if count > 0 else "info"
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-user-configuration",
                    type="user_configuration",
                    severity=severity,
                    title="Configuration utilisateurs",
                    summary=(
                        f"{count} utilisateur(s) potentiellement mal configure(s)."
                        if count > 0
                        else "Aucun utilisateur mal configure detecte dans les donnees disponibles."
                    ),
                    evidence={
                        "misconfiguredCount": count,
                        "sampleIds": _sample_ids(misconfigured.get("items")),
                    },
                    source_tools=["admin.misconfigured_users"],
                    recommended_actions=["Verifier les utilisateurs signales avant toute modification."],
                )
            )

        users = by_tool.get("admin.list_users")
        if users and str(users.get("status")) == "ok":
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-user-governance",
                    type="user_governance",
                    severity="info",
                    title="Gouvernance utilisateurs",
                    summary=str(users.get("summary") or "Lecture utilisateurs disponible."),
                    evidence={"userCount": _count_from_section(users)},
                    source_tools=["admin.list_users"],
                    recommended_actions=["Utiliser le module admin pour corriger les comptes si necessaire."],
                )
            )

        enterprises = by_tool.get("admin.list_enterprises")
        if enterprises and str(enterprises.get("status")) == "ok":
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-enterprise-governance",
                    type="enterprise_governance",
                    severity="info",
                    title="Gouvernance entreprises",
                    summary=str(enterprises.get("summary") or "Lecture entreprises disponible."),
                    evidence={"enterpriseCount": _count_from_section(enterprises)},
                    source_tools=["admin.list_enterprises"],
                    recommended_actions=["Verifier les entreprises inactives uniquement si le backend les expose."],
                )
            )

        health = by_tool.get("admin.system_health")
        if health and str(health.get("status")) == "ok":
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-system-health-read",
                    type="system_health",
                    severity="info",
                    title="Sante systeme backend",
                    summary=str(health.get("summary") or "Sante backend minimale disponible."),
                    evidence={"sectionCount": _count_from_section(health)},
                    source_tools=["admin.system_health"],
                    recommended_actions=["Consulter /health/deep pour les details techniques si necessaire."],
                )
            )
        return diagnostics

    @staticmethod
    def _unavailable_section_diagnostics(sections: list[dict[str, Any]]) -> list[AdminDiagnosticItem]:
        diagnostics: list[AdminDiagnosticItem] = []
        for index, section in enumerate(sections):
            status = str(section.get("status") or "").lower()
            if status not in {"warning", "unavailable"}:
                continue
            tool_name = str(section.get("toolName") or "")
            diagnostics.append(
                AdminDiagnosticItem(
                    id=f"admin-unavailable-{index}",
                    type="capability_unavailable",
                    severity="warning",
                    title=f"Capacite indisponible: {section.get('title') or tool_name or 'section'}",
                    summary=str(section.get("summary") or "Cette capacite admin est indisponible."),
                    evidence={"sectionStatus": status.upper(), "toolName": tool_name},
                    source_tools=[tool_name] if tool_name else [],
                    recommended_actions=["Reessayer plus tard ou verifier l'etat du service backend correspondant."],
                )
            )
        return diagnostics

    @staticmethod
    def _runtime_diagnostics(runtime_status: dict[str, Any]) -> list[AdminDiagnosticItem]:
        safe_runtime = redact_secrets(runtime_status)
        diagnostics: list[AdminDiagnosticItem] = []

        provider = safe_runtime.get("provider") if isinstance(safe_runtime.get("provider"), dict) else {}
        if provider:
            mode = str(provider.get("mode") or "disabled")
            availability = provider.get("availability")
            severity = "warning" if availability in {"error", "unavailable"} else "info"
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-provider-status",
                    type="provider_status",
                    severity=severity,
                    title="Statut fournisseur IA",
                    summary=f"Mode IA: {mode}. Mode local CPU: {provider.get('cpuMode') is True}.",
                    evidence={
                        "mode": mode,
                        "chatModel": provider.get("chatModel"),
                        "coderModel": provider.get("coderModel"),
                        "fallbackModel": provider.get("fallbackModel"),
                        "cpuMode": provider.get("cpuMode"),
                        "availability": availability,
                    },
                    source_tools=["config", "provider.health"],
                    recommended_actions=["Garder les actions metier via ToolRegistry; le provider reste non autoritaire."],
                )
            )

        redis = safe_runtime.get("redis") if isinstance(safe_runtime.get("redis"), dict) else {}
        if redis:
            enabled = bool(redis.get("enabled"))
            fallback_mode = str(redis.get("mode") or "noop")
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-redis-status",
                    type="redis_realtime_status",
                    severity="info" if not enabled or fallback_mode in {"redis", "noop"} else "warning",
                    title="Redis realtime",
                    summary=(
                        "Redis est active pour les evenements temps reel."
                        if enabled and fallback_mode == "redis"
                        else "Redis est en mode no-op/fallback; PostgreSQL et les services restent autoritaires."
                    ),
                    evidence={
                        "enabled": enabled,
                        "mode": fallback_mode,
                        "channel": redis.get("channel"),
                        "sdkAvailable": redis.get("sdk_available"),
                    },
                    source_tools=["config", "redis.status"],
                    recommended_actions=["Ne jamais utiliser Redis comme base d'autorite metier."],
                )
            )

        rag = safe_runtime.get("rag") if isinstance(safe_runtime.get("rag"), dict) else {}
        if rag:
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-rag-status",
                    type="rag_status",
                    severity="info",
                    title="RAG politique RH",
                    summary=(
                        "RAG politique configure avec citations obligatoires."
                        if rag.get("citationRequired") is True
                        else "Verifier la configuration des citations RAG avant usage politique."
                    ),
                    evidence={
                        "provider": rag.get("provider"),
                        "chromaEnabled": rag.get("chromaEnabled"),
                        "collectionName": rag.get("collectionName"),
                        "topK": rag.get("topK"),
                        "citationRequired": rag.get("citationRequired"),
                        "tenantFilterRequired": rag.get("tenantFilterRequired"),
                    },
                    source_tools=["config", "rag.status"],
                    recommended_actions=["Repondre aux politiques uniquement avec sources approuvees et citations."],
                )
            )

        braintrust = safe_runtime.get("braintrust") if isinstance(safe_runtime.get("braintrust"), dict) else {}
        if braintrust:
            enabled = bool(braintrust.get("enabled"))
            configured = bool(braintrust.get("configured"))
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-braintrust-status",
                    type="braintrust_status",
                    severity="info" if enabled and configured else "warning",
                    title="Braintrust observabilite",
                    summary=(
                        "Braintrust est configure pour tracer les requetes IA."
                        if enabled and configured
                        else "Braintrust n'est pas completement configure; les traces restent locales/no-op."
                    ),
                    evidence={
                        "enabled": enabled,
                        "configured": configured,
                        "status": braintrust.get("status"),
                        "project": braintrust.get("project_name"),
                    },
                    source_tools=["braintrust.status"],
                    recommended_actions=["Verifier le dashboard Braintrust sans exposer de secrets."],
                )
            )

        ai_monitoring = safe_runtime.get("aiMonitoring") if isinstance(safe_runtime.get("aiMonitoring"), dict) else {}
        metrics = ai_monitoring.get("metrics") if isinstance(ai_monitoring.get("metrics"), dict) else {}
        counters = metrics.get("counters") if isinstance(metrics.get("counters"), dict) else {}
        if ai_monitoring:
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-ai-monitoring-status",
                    type="ai_monitoring",
                    severity="info",
                    title="Monitoring IA operationnel",
                    summary="Les compteurs IA suivent provider, outils, RAG, voix et confirmations sans autorite metier.",
                    evidence={
                        "counterCount": len(counters),
                        "providerMode": (ai_monitoring.get("provider") or {}).get("mode") if isinstance(ai_monitoring.get("provider"), dict) else None,
                        "ragProvider": (ai_monitoring.get("rag") or {}).get("provider") if isinstance(ai_monitoring.get("rag"), dict) else None,
                    },
                    source_tools=["observability.metrics"],
                    recommended_actions=["Utiliser ces mesures pour surveiller la qualite; ne pas en faire une source d'autorite."],
                )
            )

        routers = safe_runtime.get("optionalRouters")
        if isinstance(routers, list):
            missing = [
                item
                for item in routers
                if isinstance(item, dict) and str(item.get("moduleStatus") or "").upper() != "OK"
            ]
            if missing:
                diagnostics.append(
                    AdminDiagnosticItem(
                        id="admin-optional-router-warning",
                        type="optional_router_warning",
                        severity="warning",
                        title="Modules API optionnels",
                        summary=f"{len(missing)} module(s) API optionnel(s) non charge(s).",
                        evidence={"missingModules": [item.get("module") for item in missing]},
                        source_tools=["startup.router_loader"],
                        recommended_actions=["Verifier uniquement si une fonctionnalite optionnelle depend de ces modules."],
                    )
                )

        config = safe_runtime.get("configuration") if isinstance(safe_runtime.get("configuration"), dict) else {}
        if config.get("legacyCloudProviderPlaceholder") is True:
            diagnostics.append(
                AdminDiagnosticItem(
                    id="admin-config-cloud-placeholder",
                    type="configuration_drift",
                    severity="warning",
                    title="Configuration IA historique",
                    summary="Une configuration provider cloud historique semble presente; elle doit rester inutilisee cote runtime local.",
                    evidence={"legacyCloudProviderPlaceholder": True},
                    source_tools=["config"],
                    recommended_actions=["Verifier que le mode provider local reste controle par AI_PROVIDER_MODE."],
                )
            )

        return diagnostics


def collect_admin_runtime_status(settings: Any | None = None) -> dict[str, Any]:
    resolved = settings or get_settings()
    return redact_secrets(
        {
            "provider": {
                "mode": getattr(resolved, "ai_provider_mode", "disabled"),
                "chatModel": getattr(resolved, "ollama_model", None) or getattr(resolved, "ai_provider_model", None),
                "coderModel": getattr(resolved, "ollama_coder_model", None),
                "fallbackModel": getattr(resolved, "ollama_fallback_model", None),
                "cpuMode": str(getattr(resolved, "ai_local_device", "cpu")).lower() == "cpu",
                "availability": None,
            },
            "redis": get_redis_event_status(resolved),
            "rag": {
                "provider": getattr(resolved, "rag_provider", "local_keyword"),
                "chromaEnabled": bool(getattr(resolved, "chroma_enabled", False)),
                "collectionName": getattr(resolved, "chroma_collection_name", "weentime_policy"),
                "topK": getattr(resolved, "chroma_top_k", 5),
                "citationRequired": bool(getattr(resolved, "rag_require_citations", True)),
                "tenantFilterRequired": bool(getattr(resolved, "rag_tenant_filter_required", True)),
            },
            "braintrust": build_ai_monitoring_snapshot(resolved).get("braintrust", {}),
            "aiMonitoring": build_ai_monitoring_snapshot(resolved),
            "optionalRouters": _optional_router_statuses(),
            "configuration": {
                "gatewayBaseUrl": _safe_gateway_url(getattr(resolved, "backend_base_url", None)),
                "legacyCloudProviderPlaceholder": bool(getattr(resolved, "gemini_api_key", None)),
            },
        }
    )


def redact_secrets(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: redact_secrets(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact_secrets(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_secrets(item) for item in value)
    if isinstance(value, str):
        return _redact_string(value)
    return value


_SECRET_PATTERNS = (
    re.compile(r"authorization\s*:\s*bearer\s+[^\s,;]+", re.IGNORECASE),
    re.compile(r"bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", re.IGNORECASE),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{8,}|bt_[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,})\b"),
    re.compile(r"\b(?:postgresql|postgres|mysql|mongodb|redis)://[^\s]+", re.IGNORECASE),
    re.compile(r"jdbc:postgresql://[^\s]+", re.IGNORECASE),
    re.compile(r"(?i)\b(password|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;}]+"),
)


def _redact_string(value: str) -> str:
    text = value
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text


def _optional_router_statuses() -> list[dict[str, Any]]:
    modules = ("app.api.document_generation",)
    statuses: list[dict[str, Any]] = []
    for module in modules:
        statuses.append(
            {
                "module": module,
                "moduleStatus": "OK" if importlib.util.find_spec(module) is not None else "UNAVAILABLE",
            }
        )
    return statuses


def _safe_gateway_url(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if "://" not in text:
        return text[:80]
    return text.split("://", 1)[0] + "://localhost:8222/api/v1" if "localhost" in text else "[REDACTED_URL]"


def _count_from_section(section: dict[str, Any]) -> int:
    value = section.get("count")
    if isinstance(value, int):
        return max(0, value)
    items = section.get("items")
    if isinstance(items, list):
        return len(items)
    return 0


def _sample_ids(items: Any, limit: int = 5) -> list[Any]:
    if not isinstance(items, list):
        return []
    sample: list[Any] = []
    for item in items:
        if isinstance(item, dict) and item.get("id") is not None:
            sample.append(item.get("id"))
        if len(sample) >= limit:
            break
    return sample


def _dedupe_diagnostics(values: list[AdminDiagnosticItem]) -> list[AdminDiagnosticItem]:
    seen: set[str] = set()
    output: list[AdminDiagnosticItem] = []
    for item in values:
        if item.id in seen:
            continue
        seen.add(item.id)
        output.append(item)
    return output
