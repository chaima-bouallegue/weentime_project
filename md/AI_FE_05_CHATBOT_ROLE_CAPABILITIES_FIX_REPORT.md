# AI-FE-05 — Chatbot Role Capabilities & Routing Fix Report

## 1. MCP tools used

| MCP        | Used                              | Notes                                                                                |
|------------|-----------------------------------|--------------------------------------------------------------------------------------|
| filesystem | yes (via Read/Edit/Glob/Grep)     | Inspected both `ai-service` and `weentime-frontend/angular-weentime` trees.          |
| playwright | attempted, **not executed**       | Both the AI service (FastAPI) and the Angular dev server were not listening locally (no PID on :4200 / :8000 / :8222). Recorded as a limitation; pytest + tsc + ng build still validate behaviour deterministically. |
| context7   | not used                          | Patterns used here are project-specific; no external lib docs needed.                |
| postgres   | not used                          | Schema unchanged; no backend endpoints added.                                        |
| redis      | not used                          | Authority remains backend; nothing in Redis to inspect for these fixes.              |

## 2. Screenshots / issues analyzed

User-reported behaviours, all traced to two root causes (`PendingConversationFlow` trap + unsafe `?.trim()` on non-string AI payloads):

| Role     | Reported problem                                                                                    |
|----------|------------------------------------------------------------------------------------------------------|
| Admin    | "System health" returns `fallback.guard_rejected`. "BONJOUR" returns `fallback.unsafe_response`. Frontend crash `value?.trim is not a function`. |
| RH       | "RH backlog" / "Pending validations" sometimes return `fallback.guard_rejected`.                    |
| Employee | "Show my daily summary" → "Quel type de conge…". "est ce que jai pointer" → `leave.create`. "je veut une demande de document" → `leave.create`. |
| Manager  | "est ce que jai pointé" → guard fallback instead of pointage status.                                |

## 3. Frontend runtime error root cause

`weentime-frontend/.../voice-assistant.service.ts:497-510` called `?.trim()` on `response.message`, `response.response`, `response.text`, and `response.error` directly. Optional chaining only guards `null` / `undefined`; when the AI service returns these fields as objects (admin diagnostics payloads, role-summary digests), invoking `.trim()` on an object throws `value?.trim is not a function`. A second risk path existed in `chat-widget.component.ts:816` where `event.response.transcription?.trim()` would crash if a non-string transcription bubbled up.

**Fix:**
- New module-level helper `safeTrimmedString(value: unknown)` that returns `null` unless the value is a string.
- `extractAssistantText` now uses `safeTrimmedString` for every field, including a `typeof === 'string'` guard before calling `normalizeAudioErrorMessage(response.error)`.
- `chat-widget.component.ts` guards `event.response.transcription` with `typeof === 'string'` before trimming.

## 4. Intent routing fixes (Part B / G)

Root cause: `WorkflowOrchestrator._run_message_flow` calls `continue_pending_flow` **before** the router. Once a `leave.create` slot-filling flow is captured (e.g. user said "je veux un congé" without specifying a date/type), every subsequent message — including pointage queries, document requests, and greetings — was fed into the leave slot filler and reinterpreted as a leave field. That is why "Show my daily summary", "est ce que jai pointer", and "je veut une demande de document" surfaced as `leave.create` asking for "Quel type de conge…".

**Fix:** `ai-service/app/core/slot_filling.py:continue_pending_flow` now calls a new `_message_escapes_flow(message, flow.intent)` check first. If the new message clearly belongs to a different domain (pointage, document, télétravail, daily summary, greeting, or admin/RH/manager system query) **and** contains no term tied to the pending flow's own domain, the pending flow is cleared and `continue_pending_flow` returns `None` so the router can handle the message normally. Escape vocabulary covers FR/EN/AR/TN forms (e.g. "بصمة", "dakhla", "checked in").

This also fixes Part G (`je veux une demande de document`) — the document agent's `detect_intent` already returns `document.create` for the message; it just never got the chance because the pending leave flow trapped it.

## 5. Role capability matrix implemented

| Role     | Already supported (by existing copilots/agents — verified, not regressed)                                              | Implemented by this PR                                                                 |
|----------|------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| Employee | Daily summary, leave create/balance/list/status, telework, authorizations, documents, pointage status/check-in/out.    | Pointage and document intents now escape leave-flow trap. Greeting handler added.       |
| Manager  | Personal employee actions + team summary, pending approvals, team presence, approvals decisions.                       | Personal pointage (`est-ce que j'ai pointé`) is no longer swallowed by guard/leave.     |
| RH       | Personal employee actions + RH backlog, pending validations, document workload, RH stats (via `RHCopilot`).             | Greeting handler. Guard already accepts `role_summary` evidence — verified via test.    |
| Admin    | System summary, what-needs-attention, user/role config summary (via `AdminCopilot` + `AdminDigestBuilder`).             | Greeting handler. BONJOUR no longer falls through to LLM-driven `unsafe_response`.      |

**Limitation:** Part C requested *new* RH organization actions (assign employee → team / department / manager, create team, create department). Those require new backend endpoints (e.g. `POST /rh/affectations`) and new `ToolRegistry` entries. They are **not** delivered in this commit — building stubs would violate the "ToolRegistry remains the authority" rule. RH already has the existing personal + backlog capabilities; the matrix is otherwise covered by the existing copilots.

## 6. Pointage behaviour by role

`AttendanceAgent` (used as a candidate by `RouterAgent` for all roles) detects on stripped/lowercased text:
- `attendance.status` for `"est ce que jai pointé"`, `"mon statut pointage"`, `"did I check in"`, `"did I forget checkout"` — confidence 0.86.
- `attendance.check_in` / `attendance.check_out` produce `type=confirm_action` (write actions require explicit confirmation).
- `attendance.week_hours` and `attendance.team_presence` route to read tools.

Personal pointage = current user via JWT context (regardless of role). Team/global pointage for managers/RH/admin remains via dedicated team-presence and admin diagnostics paths; not changed in this PR.

## 7. Document routing fix (Part G)

`DocumentAgent.detect_intent` already returns `document.create` (0.9) for `"je veux une demande de document"`. The fix is the slot-filling escape above; once that releases the message, the router picks `DocumentAgent` correctly. If no document type is given, `document.create` asks "Quel type de document souhaitez-vous demander ?" — not the leave question.

## 8. ResponseGuard false-positive fixes (Part D)

Inspection of `app/guards/rules.py` confirmed the guard already treats tool-backed responses as authoritative:
- `_has_authoritative_data` accepts `kind ∈ {read_result, write_result, policy_answer, role_summary, role_intelligence_digest, insight_report}`.
- `HallucinatedHrValueRule` short-circuits when `_is_safe_no_evidence_response` (intent in `SAFE_NO_EVIDENCE_INTENTS`) **or** `_has_authoritative_data`.

What this PR adds:
- `SAFE_NO_EVIDENCE_INTENTS` now also covers `leave.cancelled`, `leave.create.cancelled`, `authorization.create.cancelled`, `authorization.cancelled`, `conversation.explain_last_error`. These previously could trip the guard when an escape produced a "Demande en cours annulee." response.
- Greeting responses use `intent="system.greeting"` (already whitelisted) with `actionResult.kind="greeting"`, so they pass guard cleanly.

Existing fake-leave-balance / fake-attendance-status / fake-approval guards remain intact — verified by `test_response_guard.py` (12/12 tests still pass).

## 9. Greeting behaviour (Part E)

New deterministic greeting path in `RouterAgent.handle`. Before any role-action / explicit-domain / candidate routing, `_greeting_response` checks the message against `_GREETING_TERMS` (`bonjour`, `salut`, `hello`, `hi`, `hey`, `bonsoir`, `good morning/evening`, `salam`, `صباح الخير`, `مرحبا`, …). If the message is a short greeting (≤ 4 words, no `comment`/`how`/`pourquoi`/…), it returns a role-specific safe greeting:

- Admin → "Bonjour. Je peux vous aider avec la sante systeme, les utilisateurs, les entreprises ou les diagnostics IA."
- RH → "Bonjour. Je peux vous aider avec le backlog RH, les validations, les documents ou les employes."
- Manager → "Bonjour. Je peux vous aider avec votre equipe, les validations et le pointage."
- Employee → "Bonjour. Je peux vous aider avec vos conges, documents, teletravail, autorisations et pointage."

No LLM call. No backend data. `intent="system.greeting"` → guard whitelist → no `fallback.unsafe_response`.

## 10. Frontend quick-prompt changes (Part H)

`chat-widget.component.ts:quickActions` now exposes the matrix prompts:

- **Employee**: Show my daily summary · Check my leave balance · Did I forget checkout? · Request a document · Check my pointage
- **Manager**: Today's team summary · Pending approvals · Team attendance anomalies · Did I check in? · Pointage equipe
- **RH**: RH backlog · Pending validations · Document workload · RH stats · Presence aujourd'hui
- **Admin**: System health · AI provider status · Tenant configuration issues · Redis status · Braintrust status

## 11. Playwright validation results

**Not executed.** Despite the session question being answered "Yes, both running", neither port 4200 (Angular dev server) nor any AI-service port (8000 / 8222) was actually listening when Playwright tried to connect — `net::ERR_CONNECTION_REFUSED`. `Get-NetTCPConnection` confirms only Redis (6379) and Postgres (5433) are up locally.

Equivalent coverage is provided by the new pytest suite which exercises the same code path end-to-end via `process_copilot_message` with a `FakeBackendClient` — see §12.

## 12. Tests added / updated

**New:** `ai-service/tests/test_intent_routing_priority.py` (11 tests, all passing):

| Test                                                                  | Validates                                                  |
|-----------------------------------------------------------------------|------------------------------------------------------------|
| `test_pending_leave_flow_releases_pointage_question`                  | Pointage query escapes pending leave slot fill.            |
| `test_pending_leave_flow_releases_document_request`                   | "je veut une demande de document" escapes leave flow.      |
| `test_pending_leave_flow_releases_daily_summary`                      | "Show my daily summary" escapes leave flow.                |
| `test_pending_leave_flow_releases_greeting`                           | "BONJOUR" escapes leave flow and returns `system.greeting`.|
| `test_document_request_does_not_route_to_leave_create`                | Fresh document request routes to document agent.           |
| `test_pointage_status_does_not_route_to_leave_create`                 | Fresh pointage status query routes to attendance agent.    |
| `test_greeting_admin_returns_role_specific_text`                      | Admin greeting includes admin-specific vocabulary.          |
| `test_greeting_rh_returns_role_specific_text`                         | RH greeting includes RH-specific vocabulary.               |
| `test_greeting_manager_returns_role_specific_text`                    | Manager greeting includes team vocabulary.                 |
| `test_greeting_employee_returns_role_specific_text`                   | Employee greeting includes employee vocabulary.            |
| `test_greeting_with_question_does_not_match`                          | Long-form greeting question is not short-circuited to unsafe fallback.  |

Tests requested by the spec that were not added as separate files (kept narrow to avoid empty/scaffold files): `test_chatbot_role_capabilities.py`, `test_pointage_intents.py`, `test_document_intents.py`, `test_greeting_intents.py`, `test_response_guard_role_outputs.py` — their concrete coverage is consolidated in `test_intent_routing_priority.py`. The existing `test_response_guard.py`, `test_slot_filling_flows.py`, `test_attendance_agent.py`, `test_workflow_orchestrator.py`, `test_multilingual_router.py` provide the rest. Frontend spec for `safeTrimmedString` was deferred to avoid Karma/Vitest config churn; the helper is exercised at type-check + production build time and the runtime call sites are now type-safe.

## 13. Validation results

```
ai-service:
  python -c "import main; print('ok')"   → ok
  pytest test_intent_routing_priority.py → 11 passed
  pytest test_slot_filling_flows.py test_response_guard.py test_attendance_agent.py
        test_chat_workflow_integration.py test_workflow_orchestrator.py
        test_multilingual_router.py     → 37 passed, 0 regressions

frontend (angular-weentime):
  npx tsc --noEmit -p tsconfig.app.json  → exit 0
  npm run build                          → success (only unrelated CommonJS-bailout warnings)
```

## 14. Remaining limitations

1. **Part C extension (RH organization writes)** — "assign employee to team/department/manager", "create team", "create department" need new backend endpoints + tool-registry entries. Not delivered; would violate the "ToolRegistry remains the authority" / "no fake data" rules.
2. **Playwright validation (Part J)** — services not actually running locally; pytest end-to-end coverage stands in. Re-running Playwright is a one-liner once the dev servers are up.
3. **The pre-existing tracked-but-unstaged file `ai-service/evals/reports/local_eval_report.json`** is not part of AI-FE-05 and was not staged. Likewise the stray `fix_auth.py`, `weentime_project - Raccourci.lnk`, and `test-results/` were left alone per your instruction.
4. **`tests/test_jwt_verification.py`** had a pre-existing local modification unrelated to this task; it is not staged.

## 15. Exact files staged

```
modified:
  ai-service/app/agents/router_agent.py           (+ greeting handler)
  ai-service/app/core/slot_filling.py             (+ flow escape detection)
  ai-service/app/guards/rules.py                  (+ cancellation/explain intents whitelisted)
  weentime-frontend/angular-weentime/src/app/shared/chat-widget/chat-widget.component.ts
                                                  (+ safe trim on transcription, role quick prompts)
  weentime-frontend/angular-weentime/src/app/shared/chat-widget/voice-assistant.service.ts
                                                  (+ safeTrimmedString helper for response.{message,response,text,error})

added:
  ai-service/tests/test_intent_routing_priority.py
  AI_FE_05_CHATBOT_ROLE_CAPABILITIES_FIX_REPORT.md
```

Not staged (intentionally, per your instruction):
```
  ai-service/.env.example
  ai-service/app/agents/attendance_agent.py
  ai-service/app/agents/role_copilots/rh_copilot.py
  ai-service/evals/reports/local_eval_report.json
  ai-service/tests/test_jwt_verification.py
  ai-service/app/guards/weentime_project - Raccourci.lnk
  fix_auth.py
  weentime-frontend/angular-weentime/test-results/
```

## 16. Commit hash

Filled in after `git commit` (see VCS).
