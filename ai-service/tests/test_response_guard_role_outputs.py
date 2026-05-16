"""AI-FE-MASTER-CHATBOT-01 — ResponseGuard must accept tool-backed role outputs.

Before this fix the guard returned fallback.guard_rejected for legitimate
admin/RH/role-intelligence responses because their actionResult.kind was not
in the authoritative-data whitelist. This module locks the whitelist down so
we don't silently regress.
"""

from __future__ import annotations

from app.context.current_user import CurrentUserContext
from app.guards.response_guard import ResponseGuard
from app.models.agent_models import AgentResponse


def _context(role: str = "ADMIN") -> CurrentUserContext:
    return CurrentUserContext(
        user_id=1,
        role=role,
        entreprise_id=1,
        token=None,
        metadata={"chatbot_public_context": True, "jwt_verified": False},
    )


def _response_with(kind: str, text: str, intent: str = "admin.summary") -> AgentResponse:
    return AgentResponse(
        type="answer",
        text=text,
        intent=intent,
        confidence=0.9,
        actionResult={"kind": kind},
    )


def test_system_health_report_passes_guard() -> None:
    guard = ResponseGuard()
    response = _response_with(
        "system_health_report",
        "Gateway et organisation-service repondent pour l'utilisateur admin authentifie.",
        intent="admin.system_health",
    )
    result = guard.validate(response, _context("ADMIN"))
    assert result.allowed, result


def test_provider_status_report_passes_guard() -> None:
    guard = ResponseGuard()
    response = _response_with(
        "provider_status_report",
        "Fournisseur IA configure en mode 'ollama' (modele qwen2.5:3b).",
        intent="admin.provider_status",
    )
    assert guard.validate(response, _context("ADMIN")).allowed


def test_redis_braintrust_rag_status_pass_guard() -> None:
    guard = ResponseGuard()
    for kind, intent in (
        ("redis_status_report", "admin.redis_status"),
        ("braintrust_status_report", "admin.braintrust_status"),
        ("rag_status_report", "admin.rag_status"),
    ):
        response = _response_with(kind, "Etat configure du composant.", intent=intent)
        assert guard.validate(response, _context("ADMIN")).allowed, kind


def test_capability_unavailable_passes_guard() -> None:
    guard = ResponseGuard()
    # Meeting / planning are surfaced as capability_unavailable when the
    # reunion backend is absent. The deterministic text must not trigger
    # hallucinated_hr_value just because it mentions "reunions".
    response = AgentResponse(
        type="answer",
        text="La gestion des reunions n'est pas encore disponible dans ce contexte.",
        intent="meeting.unavailable",
        confidence=0.9,
        actionResult={"kind": "capability_unavailable", "capability": "reunion"},
    )
    assert guard.validate(response, _context("EMPLOYEE")).allowed


def test_rh_create_user_unavailable_passes_guard() -> None:
    guard = ResponseGuard()
    response = AgentResponse(
        type="answer",
        text=(
            "La creation de comptes utilisateurs est reservee aux administrateurs. "
            "En tant que RH, vous pouvez affecter un employe a une equipe."
        ),
        intent="rh.create_user_unavailable",
        confidence=0.92,
        actionResult={"kind": "rh_capability_unavailable", "capability": "create_user"},
    )
    assert guard.validate(response, _context("RH")).allowed


def test_authorization_info_passes_guard() -> None:
    guard = ResponseGuard()
    response = AgentResponse(
        type="answer",
        text=(
            "Types d'autorisation disponibles : SORTIE_ANTICIPEE, ARRIVEE_TARDIVE, "
            "ABSENCE_TEMPORAIRE, AUTRE."
        ),
        intent="authorization.info",
        confidence=0.92,
        actionResult={"kind": "capability_hint", "capability": "authorization.types"},
    )
    assert guard.validate(response, _context("EMPLOYEE")).allowed
