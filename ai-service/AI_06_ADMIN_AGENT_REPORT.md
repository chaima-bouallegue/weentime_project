# AI-06 AdminAgent Chatbot Stabilization Report

## Files Changed
- `app/agents/admin_agent.py`
- `app/agents/routing_priority.py`
- `app/agents/router_agent.py`
- `tests/test_admin_agent_chatbot.py`
- `AI_06_ADMIN_AGENT_REPORT.md`

## Root Cause
Admin chatbot flows had the correct ToolRegistry-backed foundations, but several intent paths were still too narrow:
- Arabic admin health prompts could fall into broad admin summary instead of `admin.system_health`.
- `Ollama status`, `Etat backend`, tenant configuration, list-user/list-enterprise variants, and assignment phrases needed explicit admin routing.
- Unsupported admin mutations such as service restart, DB backup/restore, AI provider mutation, RAG reindex/destructive actions, and enterprise creation could reach broad admin handling instead of a clean `capability_unavailable` response.
- Normalized routing text stripped email punctuation, so create-user payload extraction needed the original message preserved for write confirmations.

## Admin Context Behavior
- Admin routing still depends on verified/current role `ADMIN` from context.
- Non-admin roles remain denied by `AdminAgent` and ToolRegistry.
- No public chatbot context behavior was changed in this task.

## Routing and Diagnostics Behavior
- `System health`, `Etat backend`, Arabic `حالة النظام`, and TN-style `chnowa sante systeme` route to `admin.system_health`.
- `AI provider status` and `Ollama status` route to `admin.provider_status`.
- `Redis status` routes to `admin.redis_status`.
- `Braintrust status` routes to `admin.braintrust_status`.
- `Chroma status` routes to `admin.rag_status`.
- `Tenant configuration issues` routes to `admin.tenant_issues`, implemented as safe `admin.misconfigured_users` read diagnostics.
- `lister utilisateurs` and `lister entreprises` route to read-only admin tools.

## Write Confirmation Behavior
- `creer utilisateur ...` creates a confirmation for `admin.create_user` only when required fields are present.
- `changer role utilisateur ...`, `assigner manager ...`, and `Affecte RH ... entreprise ...` create confirmations for ToolRegistry write tools.
- No admin write is executed directly by the chatbot.
- Original prompt text is used for admin write payload extraction so emails/password markers are not damaged by intent normalization.

## Capability Unavailable Behavior
The following unsupported operations now return `capability_unavailable` instead of unsafe fallback:
- service restart/control: `admin.service_control`
- DB backup/restore: `admin.database_operations`
- AI provider/model mutation: `admin.ai_config_mutation`
- RAG destructive mutation/reindex: `admin.rag_mutation`
- enterprise creation without a verified tool: `admin.enterprise_creation`

## Security Guarantees Preserved
- ToolRegistry remains authoritative for all admin tools.
- Write tools still require confirmation.
- Admin diagnostics do not expose JWTs, Authorization headers, API keys, DB URLs, or raw Redis URLs.
- System/provider/Redis/RAG/Braintrust outputs remain read-only diagnostics.
- No fake system, user, enterprise, or health data was introduced.
- No Ollama, STT/TTS, RAG, or public context changes were made.

## Tests Added or Updated
- Expanded `tests/test_admin_agent_chatbot.py` with:
  - multilingual admin health routing (FR/EN/AR/TN)
  - provider/Ollama/Redis/Braintrust/Chroma status routing
  - tenant configuration diagnostics
  - user and enterprise read routing
  - create-user confirmation
  - role/manager/RH assignment confirmations
  - unsupported admin operations as `capability_unavailable`
  - secret leakage guard for admin diagnostics

## Validation Results
- `python -c "import main; print('ok')"`: passed
  - Note: optional router warning remains for missing `app.api.document_generation`, unchanged by AI-06.
- `python -m pytest tests/test_admin_agent_chatbot.py tests/test_admin_diagnostics.py tests/test_admin_monitoring.py tests/test_admin_tools.py -v`: 38 passed, 4 warnings
- `python -m pytest tests/test_chat_v2.py tests/test_response_guard_chatbot_outputs.py tests/test_multilingual_chatbot_routing.py -v`: 51 passed, 1 warning
- Extra focused regression: `python -m pytest tests/test_admin_agent.py -v`: 11 passed, 4 warnings

## Remaining Limitations
- Enterprise creation remains unavailable because no verified admin enterprise creation tool was added in this task.
- Service restart, DB backup/restore, provider mutation, and RAG reindex/destructive actions remain intentionally unavailable unless future explicit safe tools are implemented.
- Optional router warning for `app.api.document_generation` remains a separate non-blocking issue.

## Exact Files Staged
- `ai-service/app/agents/admin_agent.py`
- `ai-service/app/agents/routing_priority.py`
- `ai-service/app/agents/router_agent.py`
- `ai-service/tests/test_admin_agent_chatbot.py`
- `ai-service/AI_06_ADMIN_AGENT_REPORT.md`

## Commit Hash
- Generated after commit; see final task response and `git log --oneline -3` output.
