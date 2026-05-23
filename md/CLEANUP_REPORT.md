# CLEANUP_REPORT

Date: 2026-05-18

Scope: `ai-service/app`, `ai-service/app/agents`, `ai-service/voice`, `ai-service/app/providers`, `ai-service/app/policy`, `ai-service/app/tools`, active routes, and chatbot/voice/RAG support modules.

No files were deleted in this pass. The audit found compatibility and legacy modules that should be retired only after route/import/test replacement. Active API routes were preserved.

## KEEP

- `ai-service/app/api/chat_v2.py`: active `/v2/chat`, `/v2/chat/confirm`, and `/v2/chat/reset` route implementation.
- `ai-service/app/api/voice_v2.py`: active `/v2/voice` route implementation and finalized voice flow.
- `ai-service/app/api/health_v2.py`: active deep health and Braintrust debug endpoint.
- `ai-service/app/api/router_loader.py`: optional router loader; required for deterministic optional-router startup behavior.
- `ai-service/app/core/copilot_engine.py`: service composition, ToolRegistry registration, provider/router/session setup.
- `ai-service/app/workflows/*`: current WorkflowOrchestrator and session/state/slot filling runtime.
- `ai-service/app/guards/*`: ResponseGuard contracts and validators; current safety boundary.
- `ai-service/app/providers/router.py` and `ai-service/app/providers/ollama_provider.py`: current safe provider routing and local Ollama integration.
- `ai-service/app/tools/*_tools.py`: current ToolRegistry-backed read/write tools. Write tools remain confirmation-gated.
- `ai-service/app/tools/registry.py`, `executor.py`, `backend_client.py`, `result.py`: current authority path into backend services.
- `ai-service/app/policy/*`: current policy RAG with citation requirements and tenant/approval filtering.
- `ai-service/voice/*`: active STT/TTS services used by `/v2/voice`.
- `ai-service/app/voice/*` and `ai-service/app/voice_pipeline/*`: active voice role-intelligence and request processing modules.
- `ai-service/app/agents/attendance_agent.py`, `leave_agent.py`, `telework_agent.py`, `authorization_agent.py`, `document_agent.py`, `reunion_agent.py`, `organisation_agent.py`, `rh_agent.py`, `manager_agent.py`, `admin_agent.py`, `employee_agent.py`, `router_agent.py`: active domain/role agents.
- `ai-service/app/agents/hybrid_intent_router.py`, `llm_intent_classifier.py`, `page_context.py`: new RH hybrid routing modules.
- `ai-service/app/intelligence/*`: active role intelligence and digest/diagnostic builders.
- `ai-service/app/nlp/*`: active multilingual normalization, intent patterns, and language detection.

## DELETE

- None deleted. Several candidates look legacy-like, but they still have runtime or test references and should not be removed blindly.
- Generated/cache files such as `__pycache__` are safe to ignore or clean with normal tooling, but no source cleanup was performed here.

## REFACTOR

- `ai-service/app/agents/legacy_agent.py`: compatibility fallback. Keep until all legacy chatbot flows are replaced by explicit capability contracts or domain agents.
- `ai-service/app/tools/legacy_adapter.py`: legacy adapter remains registered for compatibility. Refactor out only after verifying no role agent, test, or frontend path uses legacy tool names.
- Optional router warning for `app.api.document_generation`: keep optional-loader behavior, but either restore the module or remove the router spec in a dedicated router cleanup task.
- Static deterministic fallback text: keep as safety contracts, but consolidate into response templates later to avoid scattered wording.
- Compatibility route/history paths: keep until Angular and gateway references are fully migrated to v2 chat/voice contracts.
- Old local keyword RAG remains as fallback when Chroma is unavailable; keep until a verified replacement is fully tested.
- Voice compatibility modules should remain until `/v2/voice` is the only frontend path and old audio-stream references are proven unused.

## UNKNOWN

- `ai-service.zip`: untracked archive in the worktree; not inspected or staged.
- `ai-service/WEENTIME_FULL_AUDIT_REPORT.md`: untracked report; not related to this task and not staged.
- `Pasted text(114).txt` and `Pasted text (2)(7).txt`: requested read-first files were not found under the project tree.
- Any old prompt/chain artifacts outside the inspected `ai-service/app`, `ai-service/voice`, `ai-service/tests`, and frontend chatbot paths need a separate filename-level deletion pass if desired.

## Cleanup Decision

The current safe action is audit-only plus targeted RH router modernization. Deleting legacy modules now would risk breaking active compatibility imports, tests, or frontend calls. The next cleanup pass should use import graph plus route telemetry to retire `legacy_agent.py` and `legacy_adapter.py` only after replacement tests are green.
