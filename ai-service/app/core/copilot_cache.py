from __future__ import annotations

import hashlib
import importlib
import logging
import re
import unicodedata
from dataclasses import dataclass
from threading import RLock
from time import perf_counter, time
from typing import Any

from app.context.current_user import CurrentUserContext
from app.models.agent_models import AgentResponse
from app.observability.tracing import log_event, start_span

logger = logging.getLogger(__name__)

CACHEABLE_INTENTS: set[str] = {
    "policy.query",
    "policy.hr",
    "policy.leave_rule",
    "policy.telework",
    "policy.general",
    "policy.attendance",
    "hr_policy",
    "hr_policy.inquiry",
    "telework.policy",
    "leave.policy",
    "attendance.policy",
    "faq.general",
    "information.company",
    "GREETING",
}

PERSONAL_DYNAMIC_TERMS: set[str] = {
    "mon solde",
    "mes conges",
    "mon equipe",
    "mon pointage",
    "ai-je pointe",
    "ai je pointe",
    "my balance",
    "my leaves",
    "solde actuel",
    "solde restant",
}


@dataclass(slots=True)
class CachedCopilotEntry:
    """Représente une entrée de cache désérialisée prête pour le workflow."""
    response: AgentResponse
    intent: str | None = None
    selected_agent: str = "copilot_cache"
    latency_ms: float = 0.0


def normalize_query_text(query: str | None) -> str:
    """Normalise une chaîne de requête pour maximiser les correspondances de cache.

    - Conversion en minuscules
    - Suppression des accents (NFKD)
    - Remplacement de la ponctuation par des espaces
    - Compression des espaces consécutifs
    """
    if not query:
        return ""
    text = query.strip().lower()

    nfkd = unicodedata.normalize("NFKD", text)
    without_accents = "".join(char for char in nfkd if not unicodedata.combining(char))

    cleaned = re.sub(r"[^\w\s]", " ", without_accents)

    normalized = re.sub(r"\s+", " ", cleaned).strip()
    return normalized


def compute_cache_key(
    *,
    normalized_query: str,
    tenant_id: int | None,
    role: str | None,
    language: str | None,
) -> str:
    """Génère une clé Redis normalisée, isolée par tenant, rôle et langue."""
    t_id = tenant_id if tenant_id is not None else 1
    r_clean = (role or "EMPLOYEE").upper().replace("ROLE_", "")
    l_clean = (language or "fr").lower()[:5]
    query_hash = hashlib.sha256(normalized_query.encode("utf-8")).hexdigest()[:24]
    return f"ai:cache:tenant:{t_id}:{r_clean}:{l_clean}:{query_hash}"


class CopilotCacheService:
    """Service de mise en cache Redis & Mémoire à haute performance pour le Copilot WeenTime.

    Architecture 'Clean Code' & Résilience :
    - Découplage strict (aucune dépendance sur les orchestrateurs).
    - Clé partitionnée multi-tenant (aucun croisement de données inter-entreprises).
    - Mode Hybride : Redis asynchrone primaire avec bascule transparente vers un cache mémoire LRU/TTL.
    - Zéro crash : les erreurs de connectivité Redis sont capturées sans impacter la requête utilisateur.
    - Métriques et traçabilité complètes (hits, misses, ratio, latence).
    """

    def __init__(
        self,
        *,
        enabled: bool = True,
        ttl_seconds: int = 86400,
        redis_enabled: bool = False,
        redis_url: str = "redis://localhost:6379",
        redis_client: Any | None = None,
        max_memory_items: int = 1000,
    ) -> None:
        self.enabled = bool(enabled)
        self.ttl_seconds = max(30, int(ttl_seconds))
        self.redis_enabled = bool(redis_enabled)
        self.redis_url = redis_url
        self.max_memory_items = max(100, int(max_memory_items))

        self._redis_client = redis_client
        self._memory_cache: dict[str, tuple[dict[str, Any], float]] = {}
        self._lock = RLock()

        # Métriques internes
        self._stats: dict[str, int] = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "errors": 0,
        }

    @property
    def stats(self) -> dict[str, Any]:
        with self._lock:
            total = self._stats["hits"] + self._stats["misses"]
            hit_ratio = round((self._stats["hits"] / total) * 100, 2) if total > 0 else 0.0
            return {
                **self._stats,
                "total_lookups": total,
                "hit_ratio_percent": hit_ratio,
                "memory_items": len(self._memory_cache),
                "redis_enabled": self.redis_enabled,
            }

    def is_query_cacheable(self, normalized_query: str) -> bool:
        """Détermine si la requête textuelle peut être servie par un cache partagé d'entreprise."""
        if not normalized_query or len(normalized_query) < 3:
            return False
        # Si la question fait explicitement référence à un solde personnel instantané, ne pas cacher
        for term in PERSONAL_DYNAMIC_TERMS:
            if term in normalized_query:
                return False
        return True

    def is_response_cacheable(
        self,
        *,
        normalized_query: str,
        response: AgentResponse,
        pending_confirmation: bool = False,
        fallback_used: bool = False,
    ) -> bool:
        """Vérifie si la réponse générée remplit tous les critères de sécurité et d'idempotence."""
        if not self.is_query_cacheable(normalized_query):
            return False

        # Seules les réponses directes sans confirmation requise sont éligibles
        if response.type != "answer":
            return False
        if response.requiresConfirmation or response.confirmationId is not None:
            return False
        if pending_confirmation or fallback_used:
            return False

        # Ne pas cacher si une action d'écriture / mutation a été déclenchée
        action_res = response.actionResult
        if isinstance(action_res, dict):
            kind = str(action_res.get("kind") or "").lower()
            if kind in {"write", "execute", "mutation"}:
                return False
            # Autoriser explicitement les résultats de lecture vérifiés (read_result)
            if "read_result" in action_res.get("data", {}) or action_res.get("kind") == "read_result":
                return True

        # Vérifier si l'intention est explicitement reconnue ou s'il s'agit d'une réponse textuelle explicative
        intent = str(response.intent or "").strip()
        if intent in CACHEABLE_INTENTS or any(intent.startswith(pfx) for pfx in ("policy.", "hr_policy", "faq.")):
            return True

        # Tolérer les réponses textuelles longues (ex: explications RAG documentaires)
        if len(response.text) >= 40:
            return True

        return False

    async def get(
        self,
        *,
        message: str,
        context: CurrentUserContext,
    ) -> CachedCopilotEntry | None:
        """Recherche une réponse valide en cache (Redis puis Mémoire)."""
        if not self.enabled:
            return None

        normalized = normalize_query_text(message)
        if not self.is_query_cacheable(normalized):
            return None

        key = compute_cache_key(
            normalized_query=normalized,
            tenant_id=context.tenant_id,
            role=context.role,
            language=context.language,
        )

        started = perf_counter()
        with start_span("copilot.cache.lookup", {"key": key, "tenant_id": context.tenant_id}):
            cached_data = await self._read(key)

            if cached_data is not None:
                duration_ms = round((perf_counter() - started) * 1000, 2)
                with self._lock:
                    self._stats["hits"] += 1

                try:
                    agent_resp = AgentResponse.model_validate(cached_data["response"])
                    # Enrichir les métadonnées de l'actionResult pour marquer le cache hit
                    if not isinstance(agent_resp.actionResult, dict):
                        agent_resp.actionResult = {}
                    agent_resp.actionResult["cached"] = True
                    agent_resp.actionResult["cache_hit"] = True
                    agent_resp.actionResult["cache_latency_ms"] = duration_ms

                    log_event(
                        "copilot.cache.hit",
                        metadata={
                            "key": key,
                            "latency_ms": duration_ms,
                            "tenant_id": context.tenant_id,
                            "intent": cached_data.get("intent") or agent_resp.intent,
                        },
                    )

                    return CachedCopilotEntry(
                        response=agent_resp,
                        intent=cached_data.get("intent") or agent_resp.intent,
                        selected_agent=cached_data.get("selected_agent") or "copilot_cache",
                        latency_ms=duration_ms,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Échec de désérialisation de l'entrée de cache %s: %s", key, exc)
                    with self._lock:
                        self._stats["errors"] += 1

            with self._lock:
                self._stats["misses"] += 1
            return None

    async def set(
        self,
        *,
        message: str,
        context: CurrentUserContext,
        response: AgentResponse,
        selected_agent: str | None = None,
        pending_confirmation: bool = False,
        fallback_used: bool = False,
        custom_ttl_seconds: int | None = None,
    ) -> bool:
        """Enregistre une réponse validée dans le cache."""
        if not self.enabled:
            return False

        normalized = normalize_query_text(message)
        if not self.is_response_cacheable(
            normalized_query=normalized,
            response=response,
            pending_confirmation=pending_confirmation,
            fallback_used=fallback_used,
        ):
            return False

        key = compute_cache_key(
            normalized_query=normalized,
            tenant_id=context.tenant_id,
            role=context.role,
            language=context.language,
        )

        ttl = custom_ttl_seconds or self.ttl_seconds
        payload: dict[str, Any] = {
            "response": response.model_dump(mode="json"),
            "intent": response.intent,
            "selected_agent": selected_agent or "copilot_cache",
            "cached_at": time(),
            "ttl": ttl,
        }

        success = await self._write(key, payload, ttl_seconds=ttl)
        if success:
            with self._lock:
                self._stats["sets"] += 1
            log_event(
                "copilot.cache.stored",
                metadata={"key": key, "tenant_id": context.tenant_id, "ttl": ttl},
            )
        return success

    async def invalidate_tenant(self, tenant_id: int | None) -> int:
        """Invalide toutes les clés associées à un tenant (ex: lors de l'upload d'une nouvelle politique RH)."""
        t_id = tenant_id if tenant_id is not None else 1
        prefix = f"ai:cache:tenant:{t_id}:"
        deleted_count = 0

        # Invalidation mémoire
        with self._lock:
            to_remove = [k for k in self._memory_cache if k.startswith(prefix)]
            for k in to_remove:
                del self._memory_cache[k]
            deleted_count += len(to_remove)

        # Invalidation Redis
        if self._redis_available():
            try:
                client = await self._client()
                cursor = 0
                pattern = f"{prefix}*"
                while True:
                    cursor, keys = await client.scan(cursor=cursor, match=pattern, count=100)
                    if keys:
                        await client.delete(*keys)
                        deleted_count += len(keys)
                    if cursor == 0:
                        break
            except Exception as exc:  # noqa: BLE001
                logger.warning("Échec d'invalidation Redis pour le tenant %s: %s", t_id, exc)

        logger.info("Cache invalidé pour le tenant %s (%d clés supprimées)", t_id, deleted_count)
        return deleted_count

    # ─────────────────────────────────────────────────────────────────────────
    # Gestion Interne du Stockage (Hybride Redis / Mémoire)
    # ─────────────────────────────────────────────────────────────────────────

    async def _read(self, key: str) -> dict[str, Any] | None:
        now = time()

        # 1. Vérification Mémoire d'abord (ultra rapide)
        with self._lock:
            entry = self._memory_cache.get(key)
            if entry is not None:
                data, expire_at = entry
                if expire_at > now:
                    return data
                del self._memory_cache[key]

        # 2. Vérification Redis si disponible
        if self._redis_available():
            try:
                import json
                client = await self._client()
                raw = await client.get(key)
                if raw:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        # Mettre à jour la mémoire locale en cache de niveau 1
                        with self._lock:
                            self._enforce_memory_capacity()
                            self._memory_cache[key] = (parsed, now + self.ttl_seconds)
                        return parsed
            except Exception as exc:  # noqa: BLE001
                logger.debug("Lecture Redis échouée pour %s (fallback mémoire transparent): %s", key, exc)

        return None

    async def _write(self, key: str, payload: dict[str, Any], ttl_seconds: int) -> bool:
        now = time()

        # 1. Écriture Mémoire
        with self._lock:
            self._enforce_memory_capacity()
            self._memory_cache[key] = (payload, now + ttl_seconds)

        # 2. Écriture Redis
        if self._redis_available():
            try:
                import json
                client = await self._client()
                raw = json.dumps(payload, ensure_ascii=False)
                await client.set(key, raw, ex=ttl_seconds)
                return True
            except Exception as exc:  # noqa: BLE001
                logger.debug("Écriture Redis échouée pour %s (maintien mémoire uniquement): %s", key, exc)
                return True

        return True

    def _enforce_memory_capacity(self) -> None:
        """Nettoie les clés expirées ou évince les plus anciennes si la capacité mémoire maximale est atteinte."""
        now = time()
        # Supprimer d'abord les entrées expirées
        expired = [k for k, (_, exp) in self._memory_cache.items() if exp <= now]
        for k in expired:
            del self._memory_cache[k]

        # Si encore trop grand, supprimer les premières 10%
        if len(self._memory_cache) >= self.max_memory_items:
            excess = len(self._memory_cache) - int(self.max_memory_items * 0.9)
            keys_to_evict = list(self._memory_cache.keys())[:max(1, excess)]
            for k in keys_to_evict:
                del self._memory_cache[k]

    def _redis_available(self) -> bool:
        if not self.redis_enabled:
            return False
        if self._redis_client is not None:
            return True
        try:
            importlib.import_module("redis.asyncio")
            return True
        except Exception:  # noqa: BLE001
            return False

    async def _client(self) -> Any:
        if self._redis_client is not None:
            return self._redis_client
        redis_module = importlib.import_module("redis.asyncio")
        self._redis_client = redis_module.Redis.from_url(self.redis_url, decode_responses=True)
        return self._redis_client

    async def aclose(self) -> None:
        if self._redis_client is not None:
            try:
                await self._redis_client.aclose()
            except Exception:  # noqa: BLE001
                pass
            self._redis_client = None
