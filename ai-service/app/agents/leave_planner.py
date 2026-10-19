import asyncio
import importlib
import json
import logging
from datetime import date
from threading import RLock
from time import time
from typing import Any

from app.context.current_user import CurrentUserContext
from app.observability.tracing import log_event, start_span
from app.tools.executor import ToolExecutor
from app.tools.result import ToolResult, get_read_result

logger = logging.getLogger(__name__)


class LeaveRiskCache:
    """Cache court (in-memory + redis) pour les vérifications préalables de congé.

    Architecture 'Clean Code' & Résilience :
    - TTL court par défaut (60s) : amortit les répétitions ou ajustements lors d'un dialogue vocal.
    - Clé partitionnée multi-tenant (tenant_id, user_id).
    - Invalidation immédiate lors de la confirmation d'une demande de congé.
    - Résilient : aucune exception en cas d'indisponibilité Redis.
    """

    def __init__(
        self,
        *,
        enabled: bool = True,
        ttl_seconds: int = 60,
        redis_enabled: bool = False,
        redis_url: str = "redis://localhost:6379",
        redis_client: Any | None = None,
        max_items: int = 500,
    ) -> None:
        self.enabled = bool(enabled)
        self.ttl_seconds = max(5, int(ttl_seconds))
        self.redis_enabled = bool(redis_enabled)
        self.redis_url = redis_url
        self._redis_client = redis_client
        self.max_items = max(50, int(max_items))
        self._memory_cache: dict[str, tuple[ToolResult, float]] = {}
        self._lock = RLock()

    def _redis_available(self) -> bool:
        if not self.redis_enabled:
            return False
        if self._redis_client is not None:
            return True
        try:
            importlib.import_module("redis.asyncio")
            return True
        except Exception:
            return False

    async def _get_redis_client(self) -> Any:
        if self._redis_client is not None:
            return self._redis_client
        redis_module = importlib.import_module("redis.asyncio")
        self._redis_client = redis_module.Redis.from_url(self.redis_url, decode_responses=True)
        return self._redis_client

    def _make_key(self, kind: str, tenant_id: int | None, user_id: int) -> str:
        t_id = tenant_id if tenant_id is not None else 1
        return f"leave:risk:{kind}:tenant:{t_id}:user:{user_id}"

    async def get_balance(self, tenant_id: int | None, user_id: int) -> ToolResult | None:
        return await self._get(self._make_key("balance", tenant_id, user_id), "balance", tenant_id, user_id)

    async def set_balance(self, tenant_id: int | None, user_id: int, result: ToolResult) -> None:
        await self._set(self._make_key("balance", tenant_id, user_id), result, "balance", tenant_id, user_id)

    async def get_requests(self, tenant_id: int | None, user_id: int) -> ToolResult | None:
        return await self._get(self._make_key("requests", tenant_id, user_id), "requests", tenant_id, user_id)

    async def set_requests(self, tenant_id: int | None, user_id: int, result: ToolResult) -> None:
        await self._set(self._make_key("requests", tenant_id, user_id), result, "requests", tenant_id, user_id)

    async def _get(self, key: str, kind: str, tenant_id: int | None, user_id: int) -> ToolResult | None:
        if not self.enabled:
            return None

        # 1. Mémoire locale
        now = time()
        with self._lock:
            entry = self._memory_cache.get(key)
            if entry is not None:
                cached_res, expiry = entry
                if now < expiry:
                    log_event("leave.risk.cache.hit", metadata={"key": key, "kind": kind, "storage": "memory", "user_id": user_id})
                    return cached_res
                self._memory_cache.pop(key, None)

        # 2. Redis asynchrone
        if self._redis_available():
            try:
                client = await self._get_redis_client()
                raw = await client.get(key)
                if raw:
                    payload = json.loads(raw)
                    result = ToolResult.model_validate(payload)
                    with self._lock:
                        self._memory_cache[key] = (result, now + self.ttl_seconds)
                    log_event("leave.risk.cache.hit", metadata={"key": key, "kind": kind, "storage": "redis", "user_id": user_id})
                    return result
            except Exception as exc:  # noqa: BLE001
                logger.debug("Redis leave risk cache get failed: %s", exc)

        log_event("leave.risk.cache.miss", metadata={"key": key, "kind": kind, "user_id": user_id})
        return None

    async def _set(self, key: str, result: ToolResult, kind: str, tenant_id: int | None, user_id: int) -> None:
        if not self.enabled or not result.success:
            return

        now = time()
        with self._lock:
            if len(self._memory_cache) >= self.max_items:
                expired_keys = [k for k, (_, exp) in self._memory_cache.items() if now >= exp]
                for k in expired_keys:
                    self._memory_cache.pop(k, None)
                if len(self._memory_cache) >= self.max_items:
                    self._memory_cache.pop(next(iter(self._memory_cache)), None)
            self._memory_cache[key] = (result, now + self.ttl_seconds)

        if self._redis_available():
            try:
                client = await self._get_redis_client()
                serialized = json.dumps(result.model_dump(mode="json"))
                await client.set(key, serialized, ex=self.ttl_seconds)
            except Exception as exc:  # noqa: BLE001
                logger.debug("Redis leave risk cache set failed: %s", exc)

    async def invalidate_user(self, tenant_id: int | None, user_id: int) -> None:
        """Invalide immédiatement les pré-vérifications en cache lors d'une mutation."""
        keys = [
            self._make_key("balance", tenant_id, user_id),
            self._make_key("requests", tenant_id, user_id),
        ]
        with self._lock:
            for k in keys:
                self._memory_cache.pop(k, None)

        if self._redis_available():
            try:
                client = await self._get_redis_client()
                await client.delete(*keys)
                log_event("leave.risk.cache.invalidated", metadata={"tenant_id": tenant_id, "user_id": user_id})
            except Exception as exc:  # noqa: BLE001
                logger.debug("Redis leave risk cache invalidation failed: %s", exc)

    def clear(self) -> None:
        with self._lock:
            self._memory_cache.clear()


_DEFAULT_LEAVE_RISK_CACHE: LeaveRiskCache | None = None


def get_default_leave_risk_cache() -> LeaveRiskCache:
    global _DEFAULT_LEAVE_RISK_CACHE
    if _DEFAULT_LEAVE_RISK_CACHE is None:
        _DEFAULT_LEAVE_RISK_CACHE = LeaveRiskCache()
    return _DEFAULT_LEAVE_RISK_CACHE


def set_default_leave_risk_cache(cache: LeaveRiskCache | None) -> None:
    global _DEFAULT_LEAVE_RISK_CACHE
    _DEFAULT_LEAVE_RISK_CACHE = cache


class LeaveRiskAnalyzer:
    """Read-only leave risk checks based only on backend/tool data."""

    def __init__(
        self,
        executor: ToolExecutor,
        cache: LeaveRiskCache | None = None,
    ) -> None:
        self.executor = executor
        self.cache = cache

    async def analyze(self, tool_input: dict[str, Any], context: CurrentUserContext) -> dict[str, Any]:
        with start_span("leave.risk.analyze", {"user_id": context.user_id, "tenant_id": context.tenant_id}):
            risks: list[dict[str, Any]] = []
            warnings: list[str] = []
            evidence: list[dict[str, Any]] = []

            # Exécution concurrente via asyncio.gather pour diviser la latence par 2
            balance_task = self._fetch_balance(context)
            requests_task = self._fetch_requests(context)
            balance_result, requests_result = await asyncio.gather(balance_task, requests_task)

            balance_read = get_read_result(balance_result.data)
            if balance_result.success and balance_read:
                evidence.append({"tool": "leave.get_balance", "summary": balance_read.get("summary")})
                balance_risk = self._balance_risk(tool_input, balance_read)
                if balance_risk:
                    risks.append(balance_risk)
            else:
                warnings.append(self._warning_for_unavailable(balance_result, "solde de conge"))

            requests_read = get_read_result(requests_result.data)
            if requests_result.success and requests_read:
                evidence.append({"tool": "leave.list_my_requests", "summary": requests_read.get("summary")})
                overlap_risk = self._overlap_risk(tool_input, requests_read)
                if overlap_risk:
                    risks.append(overlap_risk)
            else:
                warnings.append(self._warning_for_unavailable(requests_result, "demandes existantes"))

            return {
                "kind": "leave_risk_analysis",
                "risks": risks,
                "warnings": [warning for warning in warnings if warning],
                "evidence": evidence,
                "canAssess": bool(evidence),
            }

    async def _fetch_balance(self, context: CurrentUserContext) -> ToolResult:
        if self.cache is not None:
            cached = await self.cache.get_balance(context.tenant_id, context.user_id)
            if cached is not None:
                return cached

        result = await self.executor.execute("leave.get_balance", {}, context)
        if self.cache is not None and result.success:
            await self.cache.set_balance(context.tenant_id, context.user_id, result)
        return result

    async def _fetch_requests(self, context: CurrentUserContext) -> ToolResult:
        if self.cache is not None:
            cached = await self.cache.get_requests(context.tenant_id, context.user_id)
            if cached is not None:
                return cached

        result = await self.executor.execute("leave.list_my_requests", {}, context)
        if self.cache is not None and result.success:
            await self.cache.set_requests(context.tenant_id, context.user_id, result)
        return result

    @staticmethod
    def build_confirmation_text(base_text: str, analysis: dict[str, Any] | None) -> str:
        if not analysis:
            return base_text
        risks = analysis.get("risks") if isinstance(analysis, dict) else None
        warnings = analysis.get("warnings") if isinstance(analysis, dict) else None
        details: list[str] = []
        if isinstance(risks, list) and risks:
            details.extend(str(item.get("summary") or "") for item in risks if isinstance(item, dict))
        elif isinstance(warnings, list) and warnings:
            details.append("Je ne peux pas evaluer le risque complet car certaines donnees RH ne sont pas disponibles.")
        clean_details = [item for item in details if item]
        return f"{' '.join(clean_details)} {base_text}".strip() if clean_details else base_text

    @staticmethod
    def _balance_risk(tool_input: dict[str, Any], read_result: dict[str, Any]) -> dict[str, Any] | None:
        data = read_result.get("data") if isinstance(read_result, dict) else {}
        balances = []
        if isinstance(data, dict) and isinstance(data.get("balances"), list):
            balances = data["balances"]
        elif isinstance(read_result.get("items"), list):
            balances = read_result["items"]
        leave_type = _normalize_label(tool_input.get("leave_type_label"))
        selected_balance: float | None = None
        total_balance = _to_float(data.get("total") if isinstance(data, dict) else None)
        for item in balances:
            if not isinstance(item, dict):
                continue
            label = _normalize_label(item.get("libelle") or item.get("type") or item.get("nom") or item.get("name"))
            value = _first_number(item, ("joursRestants", "solde", "remaining", "balance"))
            if leave_type and label and (leave_type in label or label in leave_type):
                selected_balance = value
                break
        if selected_balance is not None and selected_balance <= 0:
            return {
                "type": "leave_balance_empty",
                "severity": "warning",
                "summary": "Votre solde pour ce type de conge semble epuise.",
                "evidence": {"leaveType": tool_input.get("leave_type_label"), "remaining": selected_balance},
            }
        if selected_balance is None and total_balance is not None and total_balance <= 0:
            return {
                "type": "leave_balance_empty",
                "severity": "warning",
                "summary": "Votre solde de conge disponible semble epuise.",
                "evidence": {"remaining": total_balance},
            }
        return None

    @staticmethod
    def _overlap_risk(tool_input: dict[str, Any], read_result: dict[str, Any]) -> dict[str, Any] | None:
        start = _parse_date(tool_input.get("start_date"))
        end = _parse_date(tool_input.get("end_date") or tool_input.get("start_date"))
        if not start or not end:
            return None
        for item in read_result.get("items") if isinstance(read_result.get("items"), list) else []:
            if not isinstance(item, dict):
                continue
            existing_start = _parse_date(_first_value(item, ("dateDebut", "startDate", "start_date", "date_debut")))
            existing_end = _parse_date(_first_value(item, ("dateFin", "endDate", "end_date", "date_fin")) or existing_start)
            if not existing_start or not existing_end:
                continue
            if start <= existing_end and end >= existing_start:
                status = str(_first_value(item, ("statut", "status")) or "").lower()
                return {
                    "type": "leave_overlap",
                    "severity": "warning",
                    "summary": "Vous avez deja une demande sur cette periode.",
                    "evidence": {"status": status, "request": item},
                }
        return None

    @staticmethod
    def _warning_for_unavailable(result: ToolResult, label: str) -> str:
        if result.status_code in (401, 403):
            return f"Les {label} ne sont pas accessibles avec votre role actuel."
        return f"Les {label} ne sont pas disponibles pour l'analyse."


def _first_value(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return None


def _first_number(item: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = _to_float(item.get(key))
        if value is not None:
            return value
    return None


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _parse_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _normalize_label(value: Any) -> str:
    return str(value or "").strip().lower().replace("_", " ").replace("-", " ")
