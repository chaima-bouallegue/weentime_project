from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.context.current_user import CurrentUserContext
from app.core.copilot_cache import (
    CopilotCacheService,
    compute_cache_key,
    normalize_query_text,
)
from app.core.conversation_state import ConversationStateStore
from app.guards.response_guard import ResponseGuard
from app.memory.confirmation_store import ConfirmationStore
from app.models.agent_models import AgentResponse, ToolCallRecord
from app.tools.result import ToolResult, build_read_result
from app.workflows.workflow_orchestrator import WorkflowOrchestrator


def make_context(
    user_id: int = 10,
    tenant_id: int = 1,
    role: str = "EMPLOYEE",
    language: str = "fr",
) -> CurrentUserContext:
    return CurrentUserContext(
        user_id=user_id,
        role=role,
        entreprise_id=tenant_id,
        language=language,
        metadata={"jwt_verified": True},
    )


def test_normalize_query_text() -> None:
    # Retrait des accents, espaces multiples, ponctuation et casse
    raw = "  Quelles sont les règles de Télétravail ??? \n Merci ! "
    normalized = normalize_query_text(raw)
    assert normalized == "quelles sont les regles de teletravail merci"

    # Vérification que deux formulations avec/sans accent donnent la même chaîne
    assert normalize_query_text("politique de congés") == normalize_query_text("Politique de conges?")


def test_compute_cache_key_isolation() -> None:
    norm_q = "quelles sont les regles de teletravail"
    key_tenant1_emp_fr = compute_cache_key(
        normalized_query=norm_q,
        tenant_id=1,
        role="EMPLOYEE",
        language="fr",
    )
    key_tenant2_emp_fr = compute_cache_key(
        normalized_query=norm_q,
        tenant_id=2,
        role="EMPLOYEE",
        language="fr",
    )
    key_tenant1_admin_fr = compute_cache_key(
        normalized_query=norm_q,
        tenant_id=1,
        role="ADMIN",
        language="fr",
    )
    key_tenant1_emp_en = compute_cache_key(
        normalized_query=norm_q,
        tenant_id=1,
        role="EMPLOYEE",
        language="en",
    )

    # Chaque axe de sécurité génère une clé différente (Multi-Tenant & RBAC & i18n)
    assert key_tenant1_emp_fr != key_tenant2_emp_fr
    assert key_tenant1_emp_fr != key_tenant1_admin_fr
    assert key_tenant1_emp_fr != key_tenant1_emp_en
    assert "tenant:1:EMPLOYEE:fr:" in key_tenant1_emp_fr


def test_cache_eligibility_rules() -> None:
    cache = CopilotCacheService()

    # 1. Réponse informative de politique RH sans confirmation -> Éligible
    resp_policy = AgentResponse(
        type="answer",
        text="Le télétravail est autorisé jusqu'à 2 jours par semaine selon la convention.",
        intent="policy.telework",
        confidence=0.95,
        requiresConfirmation=False,
    )
    assert cache.is_response_cacheable(
        normalized_query="regles de teletravail",
        response=resp_policy,
        pending_confirmation=False,
        fallback_used=False,
    ) is True

    # 2. Réponse avec action nécessitant confirmation -> NON Éligible
    resp_action = AgentResponse(
        type="answer",
        text="Voulez-vous confirmer votre demande de congé ?",
        intent="leave.create",
        requiresConfirmation=True,
        confirmationId="conf-123",
    )
    assert cache.is_response_cacheable(
        normalized_query="demande conge",
        response=resp_action,
        pending_confirmation=False,
        fallback_used=False,
    ) is False

    # 3. Réponse d'erreur -> NON Éligible
    resp_err = AgentResponse(
        type="error",
        text="Erreur interne",
        intent="error",
    )
    assert cache.is_response_cacheable(
        normalized_query="regles de teletravail",
        response=resp_err,
        pending_confirmation=False,
        fallback_used=False,
    ) is False

    # 4. Question sur solde personnel dynamique -> NON Éligible (Protection des données privées)
    assert cache.is_query_cacheable("quel est mon solde actuel") is False


@pytest.mark.asyncio
async def test_cache_memory_roundtrip_and_stats() -> None:
    cache = CopilotCacheService(enabled=True, ttl_seconds=300)
    ctx = make_context(tenant_id=5, role="EMPLOYEE", language="fr")

    query = "Quelles sont les règles de télétravail ?"
    response = AgentResponse(
        type="answer",
        text="Le télétravail est possible 2 jours par semaine sur accord managérial.",
        intent="policy.telework",
        confidence=0.98,
    )

    # 1. Avant mise en cache : Cache Miss
    miss_result = await cache.get(message=query, context=ctx)
    assert miss_result is None

    # 2. Sauvegarde en cache
    stored = await cache.set(message=query, context=ctx, response=response)
    assert stored is True

    # 3. Après mise en cache : Cache Hit instantané
    hit_result = await cache.get(message=query, context=ctx)
    assert hit_result is not None
    assert hit_result.response.text == response.text
    assert hit_result.intent == "policy.telework"
    assert hit_result.response.actionResult["cached"] is True
    assert hit_result.response.actionResult["cache_hit"] is True

    # 4. Vérification des statistiques
    stats = cache.stats
    assert stats["hits"] == 1
    assert stats["misses"] == 1
    assert stats["sets"] == 1
    assert stats["hit_ratio_percent"] == 50.0


@pytest.mark.asyncio
async def test_tenant_invalidation() -> None:
    cache = CopilotCacheService(enabled=True)
    ctx_tenant1 = make_context(tenant_id=1)
    ctx_tenant2 = make_context(tenant_id=2)

    query = "Politique des congés"
    response = AgentResponse(
        type="answer",
        text="Politique entreprise sur les congés payés.",
        intent="policy.leave",
    )

    await cache.set(message=query, context=ctx_tenant1, response=response)
    await cache.set(message=query, context=ctx_tenant2, response=response)

    # Les deux tenants ont leur entrée en cache
    assert await cache.get(message=query, context=ctx_tenant1) is not None
    assert await cache.get(message=query, context=ctx_tenant2) is not None

    # Invalidation du tenant 1 uniquement
    deleted = await cache.invalidate_tenant(tenant_id=1)
    assert deleted >= 1

    # Tenant 1 est vidé, Tenant 2 est préservé
    assert await cache.get(message=query, context=ctx_tenant1) is None
    assert await cache.get(message=query, context=ctx_tenant2) is not None


@pytest.mark.asyncio
async def test_workflow_orchestrator_integration_with_cache() -> None:
    """Valide que le WorkflowOrchestrator court-circuite le routeur/LLM lors d'un cache hit."""
    policy_text = "Statut de pointage: ACTIVE."
    tool_res = ToolResult.ok(
        {"read_result": build_read_result(tool_name="get_pointage_status", summary=policy_text, data={"status": "ACTIVE"})},
        status_code=200,
    )
    authoritative_resp = AgentResponse(
        type="answer",
        text=policy_text,
        intent="attendance.status",
        confidence=0.9,
        toolCalls=[ToolCallRecord(name="get_pointage_status", arguments={}, status="success")],
        actionResult=tool_res.model_dump(mode="json"),
    )
    async def fake_handle(message, ctx):
        ctx.metadata.setdefault("selected_agent", "attendance")
        return authoritative_resp

    router_mock = MagicMock()
    router_mock.handle = AsyncMock(side_effect=fake_handle)

    context = make_context(user_id=15, tenant_id=8)
    cache = CopilotCacheService(enabled=True, ttl_seconds=600)

    class DummyContextBuilder:
        async def build(self, *args, **kwargs):
            return context

    class DisabledProviderRouter:
        mode = "disabled"
        default_model = None

    orchestrator = WorkflowOrchestrator(
        context_builder=DummyContextBuilder(),
        router_agent=router_mock,
        confirmation_store=ConfirmationStore(),
        executor=MagicMock(),
        conversation_store=ConversationStateStore(),
        response_guard=ResponseGuard(),
        provider_router=DisabledProviderRouter(),
        cache_service=cache,
    )

    query = "Est-ce que je suis pointe ?"

    # 1er appel : Cache Miss -> Appel du router agent
    res1 = await orchestrator.process_message(
        user_id=15,
        message=query,
        access_token="tok",
        role="EMPLOYEE",
        context=context,
    )
    assert res1.response.text == policy_text
    assert router_mock.handle.call_count == 1

    # 2eme appel identique : Cache Hit -> Le router agent n'est PAS ré-exécuté !
    res2 = await orchestrator.process_message(
        user_id=15,
        message=query,
        access_token="tok",
        role="EMPLOYEE",
        context=context,
    )
    assert res2.response.text == policy_text
    assert res2.response.actionResult.get("cached") is True
    # Le compteur d'appel au router reste à 1 !
    assert router_mock.handle.call_count == 1


@pytest.mark.asyncio
async def test_redis_graceful_degradation() -> None:
    """Si Redis génère une exception, le service bascule en mémoire sans lever d'erreur."""
    failing_redis = MagicMock()
    failing_redis.get = AsyncMock(side_effect=ConnectionError("Redis down"))
    failing_redis.set = AsyncMock(side_effect=ConnectionError("Redis down"))

    cache = CopilotCacheService(
        enabled=True,
        redis_enabled=True,
        redis_client=failing_redis,
    )
    ctx = make_context()

    query = "Règlement intérieur de la société"
    response = AgentResponse(
        type="answer",
        text="Texte du règlement intérieur.",
        intent="policy.internal",
    )

    # Set ne crash pas
    stored = await cache.set(message=query, context=ctx, response=response)
    assert stored is True

    # Get ne crash pas et récupère l'entrée depuis la mémoire locale (fallback L1)
    hit = await cache.get(message=query, context=ctx)
    assert hit is not None
    assert hit.response.text == response.text
