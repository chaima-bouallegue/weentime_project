from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.context.current_user import CurrentUserContext
from app.models.tool_models import ToolDefinition
from app.observability.braintrust_client import log_rag_interaction
from app.policy import LocalPolicyStore, PolicyRetriever
from app.policy.source_citation import citations_to_dicts, valid_citation_dicts

from .registry import ToolRegistry
from .result import ToolResult, build_read_result

POLICY_ROLES = {"EMPLOYEE", "MANAGER", "RH", "ADMIN"}
POLICY_UNAVAILABLE = "Je n'ai pas trouve de source RH approuvee pour repondre a cette question."


class PolicySearchInput(BaseModel):
    query: str = Field(min_length=2)
    language: str | None = None
    limit: int = Field(default=3, ge=1, le=5)


class PolicySourceInput(BaseModel):
    source_id: str = Field(min_length=1)


class PolicyTools:
    def __init__(self, retriever: PolicyRetriever | None = None) -> None:
        self.retriever = retriever or PolicyRetriever(LocalPolicyStore())

    def register(self, registry: ToolRegistry) -> None:
        registry.register(
            ToolDefinition(
                name="policy.search",
                description="Recherche des sources RH approuvees dans le tenant courant.",
                input_model=PolicySearchInput,
                output_model=None,
                type="read",
                allowed_roles=POLICY_ROLES,
            ),
            self.search,
        )
        registry.register(
            ToolDefinition(
                name="policy.get_source",
                description="Retourne une source RH approuvee par identifiant dans le tenant courant.",
                input_model=PolicySourceInput,
                output_model=None,
                type="read",
                allowed_roles=POLICY_ROLES,
            ),
            self.get_source,
        )
        registry.register(
            ToolDefinition(
                name="policy.explain_rule",
                description="Explique une regle RH uniquement depuis des sources approuvees citees.",
                input_model=PolicySearchInput,
                output_model=None,
                type="read",
                allowed_roles=POLICY_ROLES,
            ),
            self.explain_rule,
        )

    async def search(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        return self._search_result("policy.search", payload, context)

    async def explain_rule(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        return self._search_result("policy.explain_rule", payload, context)

    async def get_source(self, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        source = self.retriever.get_source(source_id=getattr(payload, "source_id"), tenant_id=context.tenant_id)
        if source is None:
            return _policy_unavailable("policy.get_source")
        item = {
            "sourceId": source.id,
            "title": source.title,
            "sourceType": source.source_type,
            "pathOrUrl": source.path_or_url,
            "language": source.language,
            "updatedAt": source.updated_at,
        }
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name="policy.get_source",
                    summary=f"Source RH approuvee: {source.title}.",
                    items=[item],
                    count=1,
                    data={"source": item, "policyAvailable": True},
                    empty=False,
                )
            }
        )

    def _search_result(self, tool_name: str, payload: BaseModel, context: CurrentUserContext) -> ToolResult:
        query = str(getattr(payload, "query") or "").strip()
        language = str(getattr(payload, "language", None) or context.language or "fr").lower()
        limit = int(getattr(payload, "limit", 3))
        result = self.retriever.search(query=query, tenant_id=context.tenant_id, language=language, limit=limit)
        citations = valid_citation_dicts(citations_to_dicts(result.citations))
        settings = getattr(self.retriever, "settings", None)
        collection = str(getattr(settings, "chroma_collection_name", "weentime_policy")) if settings else "weentime_policy"
        if not citations:
            log_rag_interaction(
                question=query,
                output_text=POLICY_UNAVAILABLE,
                provider=result.provider,
                collection=collection,
                retrieved_chunks=0,
                top_k=result.top_k or limit,
                citations_required=bool(getattr(settings, "rag_require_citations", True)) if settings else True,
                citations_found=False,
                tenant_filter_applied=result.tenant_filter_applied,
                fallback_used=result.fallback_used,
                role=context.role,
                intent="policy.question",
                language=language,
                tenant_id=context.tenant_id,
                company_id=context.entreprise_id,
                user_id=context.user_id,
                status="error" if result.error_type and not result.fallback_used else "success",
                error_type=result.error_type,
                error_message=result.error_message,
                endpoint="/v2/voice" if context.metadata.get("channel") == "voice" else "/v2/chat",
                request_id=str(context.metadata.get("request_id") or "") or None,
                metadata_extra={
                    "embedding_model": getattr(settings, "chroma_embedding_model", None) if settings else None,
                    "embedding_endpoint": "/api/embeddings" if result.provider == "chromadb" else "none",
                },
            )
            return _policy_unavailable(tool_name, query=query)
        for item in citations:
            if isinstance(item, dict):
                item["excerpt"] = _clean_excerpt(str(item.get("excerpt") or ""))
        answer = _answer_from_citations(citations, language=language)
        log_rag_interaction(
            question=query,
            output_text=answer,
            provider=result.provider,
            collection=collection,
            retrieved_chunks=len(citations),
            top_k=result.top_k or limit,
            citations_required=bool(getattr(settings, "rag_require_citations", True)) if settings else True,
            citations_found=True,
            tenant_filter_applied=result.tenant_filter_applied,
            fallback_used=result.fallback_used,
            role=context.role,
            intent="policy.question",
            language=language,
            tenant_id=context.tenant_id,
            company_id=context.entreprise_id,
            user_id=context.user_id,
            status="success",
            error_type=result.error_type,
            error_message=result.error_message,
            endpoint="/v2/voice" if context.metadata.get("channel") == "voice" else "/v2/chat",
            request_id=str(context.metadata.get("request_id") or "") or None,
            metadata_extra={
                "embedding_model": getattr(settings, "chroma_embedding_model", None) if settings else None,
                "embedding_endpoint": "/api/embeddings" if result.provider == "chromadb" else "none",
                "citation_labels": [
                    str(item.get("citationLabel") or item.get("sourceId") or "")
                    for item in citations
                ],
            },
        )
        hybrid = calculate_hybrid_confidence(citations)
        return ToolResult.ok(
            {
                "read_result": build_read_result(
                    tool_name=tool_name,
                    summary=answer,
                    items=citations,
                    count=len(citations),
                    data={
                        "answer": answer,
                        "citations": citations,
                        "retrieval_score": hybrid["retrieval_score"],
                        "confidence": hybrid["final_confidence"],
                        "confidence_breakdown": hybrid["confidence_breakdown"],
                        "policyAvailable": True,
                    },
                    empty=False,
                )
            }
        )


def register_policy_tools(registry: ToolRegistry, retriever: PolicyRetriever | None = None) -> PolicyTools:
    tools = PolicyTools(retriever)
    tools.register(registry)
    return tools


def _policy_unavailable(tool_name: str, *, query: str | None = None) -> ToolResult:
    read_result = build_read_result(
        tool_name=tool_name,
        summary=POLICY_UNAVAILABLE,
        items=[],
        count=0,
        data={
            "answer": POLICY_UNAVAILABLE,
            "citations": [],
            "retrieval_score": 0.0,
            "confidence": 0.0,
            "confidence_breakdown": {
                "semantic_match": 0.0,
                "intent_match": 0.0,
                "tenant_match": 0.0,
                "source_approved": 0.0,
                "final": 0.0,
            },
            "policyAvailable": False,
            "query": query,
        },
        error={"code": "policy_unavailable", "message": POLICY_UNAVAILABLE},
        empty=True,
    )
    return ToolResult.fail("policy_unavailable", POLICY_UNAVAILABLE, status_code=404, data={"read_result": read_result})


def _clean_excerpt(text: str) -> str:
    if not text:
        return ""
    cleaned = text.strip()
    if cleaned.startswith("---"):
        parts = cleaned.split("---", 2)
        if len(parts) >= 3:
            cleaned = parts[2].strip()
    cleaned = cleaned.replace("\\#", "#").replace("\\*", "*").replace("\\_", "_").replace("\\-", "-")
    return cleaned.strip()


_FR_TRANSLATIONS = {
    "leave policy": "Politique de congés",
    "employees can request annual leave through weentime.": "Les employés peuvent demander un congé annuel via WeenTime.",
    "leave requests must be approved by the manager or rh depending on company workflow.": "Les demandes de congé doivent être approuvées par le manager ou les RH selon le workflow de l'entreprise.",
    "medical leave may require supporting documents.": "Les congés maladie peuvent nécessiter des pièces justificatives.",
    "remote work requests are subject to manager approval.": "Les demandes de télétravail sont soumises à l'approbation du manager.",
}


def _translate_excerpt_fr(text: str) -> str:
    cleaned = _clean_excerpt(text)
    lines = []
    for line in cleaned.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        lowered = stripped.lower()
        if lowered.startswith("# "):
            lines.append(f"### {_FR_TRANSLATIONS.get(lowered[2:], stripped[2:])}")
        elif lowered in _FR_TRANSLATIONS:
            lines.append(f"• {_FR_TRANSLATIONS[lowered]}")
        else:
            lines.append(stripped)
    return "\n".join(lines) if lines else cleaned


_AR_TRANSLATIONS = {
    "leave policy": "سياسة الإجازات",
    "employees can request annual leave through weentime.": "يمكن للموظفين تقديم طلب إجازة سنوية عبر WeenTime.",
    "leave requests must be approved by the manager or rh depending on company workflow.": "يجب الموافقة على طلبات الإجازة من قبل المدير أو الموارد البشرية حسب سير العمل في الشركة.",
    "medical leave may require supporting documents.": "قد تتطلب الإجازات المرضية وثائق إثباتية.",
    "remote work requests are subject to manager approval.": "تخضع طلبات العمل عن بُعد لموافقة المدير.",
}


def _translate_excerpt_ar(text: str) -> str:
    cleaned = _clean_excerpt(text)
    lines = []
    for line in cleaned.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        lowered = stripped.lower()
        if lowered.startswith("# "):
            lines.append(f"### {_AR_TRANSLATIONS.get(lowered[2:], stripped[2:])}")
        elif lowered in _AR_TRANSLATIONS:
            lines.append(f"• {_AR_TRANSLATIONS[lowered]}")
        else:
            lines.append(stripped)
    return "\n".join(lines) if lines else cleaned


def _answer_from_citations(citations: list[dict[str, Any]], *, language: str) -> str:
    first = citations[0]
    title = str(first.get("title") or "source RH").split("/")[0].strip()
    excerpt = _clean_excerpt(str(first.get("excerpt") or "").strip())
    if language == "en":
        return f"According to HR policy '{title}':\n\n{excerpt}"
    if language in {"ar", "tn"}:
        translated = _translate_excerpt_ar(excerpt)
        return f"حسب سياسة الموارد البشرية '{title}':\n\n{translated}"
    translated = _translate_excerpt_fr(excerpt)
    return f"Selon la politique RH '{title}' :\n\n{translated}"


def calculate_hybrid_confidence(
    citations: list[dict[str, Any]],
    intent_confidence: float = 0.90,
    tenant_match: bool = True,
    source_approved: bool = True,
) -> dict[str, Any]:
    scores = [float(item.get("score") or 0.0) for item in citations]
    semantic_match = round(max(scores) if scores else 0.0, 3)
    # Weights tuned for multi-tenant SaaS RH:
    # - tenant isolation is critical (wrong tenant = wrong policy)
    # - source approval ensures only HR-validated content is served
    final_score = round(
        (0.40 * semantic_match)
        + (0.25 * intent_confidence)
        + (0.20 * (1.0 if tenant_match else 0.0))
        + (0.15 * (1.0 if source_approved else 0.0)),
        3,
    )
    # Hard penalty: cross-tenant answers are dangerous in HR context
    if not tenant_match:
        final_score = round(final_score * 0.3, 3)
    return {
        "retrieval_score": semantic_match,
        "confidence_breakdown": {
            "semantic_match": semantic_match,
            "intent_match": round(intent_confidence, 3),
            "tenant_match": 1.0 if tenant_match else 0.0,
            "source_approved": 1.0 if source_approved else 0.0,
            "final": final_score,
        },
        "final_confidence": final_score,
    }


def _confidence(citations: list[dict[str, Any]]) -> float:
    return calculate_hybrid_confidence(citations)["final_confidence"]
