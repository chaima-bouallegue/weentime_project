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
        if not citations:
            log_rag_interaction(
                question=query,
                output_text=POLICY_UNAVAILABLE,
                provider=result.provider,
                collection=str(getattr(self.retriever.settings, "chroma_collection_name", "weentime_policy")),
                retrieved_chunks=0,
                top_k=result.top_k or limit,
                citations_required=bool(getattr(self.retriever.settings, "rag_require_citations", True)),
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
                    "embedding_model": getattr(self.retriever.settings, "chroma_embedding_model", None),
                    "embedding_endpoint": "/api/embeddings" if result.provider == "chromadb" else "none",
                },
            )
            return _policy_unavailable(tool_name, query=query)
        answer = _answer_from_citations(citations, language=language)
        log_rag_interaction(
            question=query,
            output_text=answer,
            provider=result.provider,
            collection=str(getattr(self.retriever.settings, "chroma_collection_name", "weentime_policy")),
            retrieved_chunks=len(citations),
            top_k=result.top_k or limit,
            citations_required=bool(getattr(self.retriever.settings, "rag_require_citations", True)),
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
                "embedding_model": getattr(self.retriever.settings, "chroma_embedding_model", None),
                "embedding_endpoint": "/api/embeddings" if result.provider == "chromadb" else "none",
                "citation_labels": [
                    str(item.get("citationLabel") or item.get("sourceId") or "")
                    for item in citations
                ],
            },
        )
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
                        "confidence": _confidence(citations),
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
        data={"answer": POLICY_UNAVAILABLE, "citations": [], "confidence": 0.0, "policyAvailable": False, "query": query},
        error={"code": "policy_unavailable", "message": POLICY_UNAVAILABLE},
        empty=True,
    )
    return ToolResult.fail("policy_unavailable", POLICY_UNAVAILABLE, status_code=404, data={"read_result": read_result})


def _answer_from_citations(citations: list[dict[str, Any]], *, language: str) -> str:
    first = citations[0]
    title = str(first.get("title") or "source RH")
    source_id = str(first.get("sourceId") or first.get("source_id") or "").strip()
    chunk_id = str(first.get("chunkId") or first.get("chunk_id") or "").strip()
    citation = f"{source_id} / {chunk_id}".strip(" /") or title
    excerpt = str(first.get("excerpt") or "").strip()
    if language == "en":
        return f"According to approved HR source '{title}' ({citation}): {excerpt}"
    if language == "ar":
        return f"حسب مصدر الموارد البشرية المعتمد '{title}' ({citation}): {excerpt}"
    return f"Selon la source RH approuvee '{title}' ({citation}) : {excerpt}"


def _confidence(citations: list[dict[str, Any]]) -> float:
    scores = [float(item.get("score") or 0.0) for item in citations]
    return round(max(scores) if scores else 0.0, 3)
