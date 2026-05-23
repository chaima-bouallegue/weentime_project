# AI-10 RAG Policy Citations Report

## Files changed
- `app/policy/source_citation.py`
- `app/tools/policy_tools.py`
- `app/agents/hr_policy_agent.py`
- `app/agents/routing_priority.py`
- `app/guards/rules.py`
- `app/policy/RAG_UPGRADE_NOTES.md`
- `tests/test_policy_agent.py`
- `tests/test_policy_retriever.py`
- `tests/test_response_guard_chatbot_outputs.py`

## Root cause
Policy/RAG retrieval already filtered tenant sources and approved metadata, but citation enforcement was too shallow. A non-empty citation list could be treated as sufficient even when it lacked a source locator. The policy agent could also classify broad question phrasing as policy/RAG even when the user was asking for live operational data such as leave balances or pointage status.

## Citation hardening
- Added `valid_citation_dicts` and citation normalization in `app/policy/source_citation.py`.
- A valid policy citation now requires:
  - source id
  - source title
  - chunk id, citation label, or source location
- `PolicyTools` filters citations through this validator before returning a successful policy answer.
- `HRPolicyAgent` treats missing or malformed citations as policy unavailable.
- `ResponseGuard` now enforces valid citation metadata for `policy_answer` and `citation_result` contracts.
- Contradictory responses with `policyAvailable=true` and no valid citation are rejected.

## Unavailable behavior
When no approved cited source exists, policy answers return the controlled unavailable response:

`Je n'ai pas trouve de source RH approuvee pour repondre a cette question.`

The unavailable response is allowed only when the response is explicitly marked unavailable, not when an answer claims policy availability without valid citations.

## Tenant and approval filters
Existing tenant and approval protections remain enforced:
- `LocalPolicyStore.list_sources(..., approved_only=True)` filters tenant-local approved sources.
- `ChromaPolicyRetriever` uses a Chroma `where` clause for `tenant_id`, `approved=true`, and language.
- Chroma results are post-filtered again before citation creation.
- Ingestion still skips forbidden live/private source types and redacts secret-like content before embedding.

## Policy vs live data boundary
Added deterministic live-data exclusions before policy/RAG routing:
- Leave balance questions do not route to `HRPolicyAgent`.
- Pointage/attendance status questions do not route to `HRPolicyAgent`.
- User, approval, RH backlog, provider, Redis, Braintrust, Chroma, and system-health prompts do not route to RAG unless they are explicitly policy/FAQ questions.
- These prompts must continue through ToolRegistry/domain agents, or return `capability_unavailable` if no verified backend capability exists.

## Ollama safety
Ollama is not policy authority. Guard tests now cover the failure mode where an enhanced provider rewrite attempts to produce a policy answer without valid citations. Such output is rejected as `missing_citation`.

## Future RAG upgrade notes
Created `app/policy/RAG_UPGRADE_NOTES.md` with the approved future direction:
- Docling for approved offline policy PDF extraction
- BGE-M3 embeddings for multilingual retrieval
- pgvector only after formal approval for vector storage
- bge-reranker-v2 as a post-filter reranker

The notes preserve the current invariants: approved static sources only, tenant filtering, citations required, and no live HR/private data indexing.

## Tests added/updated
- `tests/test_policy_agent.py`
  - malformed citations return unavailable
  - leave balance does not route to policy agent
  - pointage status does not route to policy agent
- `tests/test_policy_retriever.py`
  - retrieved citations pass valid citation metadata checks
- `tests/test_response_guard_chatbot_outputs.py`
  - malformed policy citation rejected
  - Ollama/provider rewrite without citations rejected
  - contradictory `policyAvailable=true` without citations rejected

## Validation results
- `python -c "import main; print('ok')"` passed.
  - Existing optional-router warning remains: `app.api.document_generation` is unavailable.
- `python -m pytest tests/test_policy_agent.py tests/test_policy_retriever.py tests/test_policy_ingestion.py tests/test_chromadb_policy_retriever.py -v`
  - `30 passed`
- `python -m pytest tests/test_chat_v2.py tests/test_response_guard_chatbot_outputs.py -v`
  - `21 passed`
  - Existing warning: `audioop` deprecation from voice STT import.

## Remaining limitations
- ChromaDB remains optional; when unavailable, keyword fallback remains the safe path.
- The policy corpus must be seeded with approved static sources for cited answers to be available.
- Future Docling/BGE/pgvector/reranker work is documented but not implemented in this task.

## Exact files staged
To be staged from project root only:
- `ai-service/app/agents/hr_policy_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/app/guards/rules.py`
- `ai-service/app/policy/RAG_UPGRADE_NOTES.md`
- `ai-service/app/policy/source_citation.py`
- `ai-service/app/tools/policy_tools.py`
- `ai-service/tests/test_policy_agent.py`
- `ai-service/tests/test_policy_retriever.py`
- `ai-service/tests/test_response_guard_chatbot_outputs.py`
- `ai-service/AI_10_RAG_POLICY_CITATIONS_REPORT.md`

## Commit hash
Pending commit.
