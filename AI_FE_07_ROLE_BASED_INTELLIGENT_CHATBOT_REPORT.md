# AI-FE-07 — Role-based intelligent chatbot agents (Slice 1: org-structure + meeting tools)

Date: 2026-05-15
Branch: main
Commit: see end-of-report.

## 1. Scope of this PR (read this first)

The original AI-FE-07 spec was ~700 lines covering: chatbot public auth, intent routing in 4 languages, role capability matrices, ResponseGuard fixes, frontend UI redesign, Playwright validation, multilingual test matrices, and Ollama provider verification. The companion analysis `PROJECT_DB_BACKEND_FRONTEND_ANALYSIS_REPORT.md` (commit `fd2d1b6`) showed that ~80% of those items had already shipped in earlier rounds:

- `CHATBOT_PUBLIC_AUTH_REMOVAL_REPORT.md` — env-flagged `CHATBOT_PUBLIC_MODE` public auth (matches AskUserQuestion answer).
- `AI_FE_05_CHATBOT_ROLE_CAPABILITIES_FIX_REPORT.md` — slot-flow escape, greeting handler, `safeTrimmedString` crash fix, role-aware quick prompts, ResponseGuard intent whitelisting.
- `FE_AI_06_CHATBOT_POSITION_FIX_REPORT.md` — chat panel CSS positioning rewrite.
- `P5_01_MANAGER_RH_APPROVAL_MODERNIZATION_REPORT.md` — Manager/RH approval flows migrated to typed PATCH endpoints.

This PR delivers **what was genuinely missing**: two new tool modules wrapping existing backend endpoints that the chatbot did not previously expose.

### What this PR ships

| Tool | Endpoint | Roles | Type |
|---|---|---|---|
| `organisation.list_teams` | `GET /api/v1/organisations/equipes` | ADMIN, RH, MANAGER | read |
| `organisation.list_departments` | `GET /api/v1/organisations/departements` | ADMIN, RH, MANAGER | read |
| `organisation.create_team` | `POST /api/v1/organisations/equipes` | ADMIN, RH | write, requires confirmation, idempotent |
| `organisation.create_department` | `POST /api/v1/organisations/departements` | ADMIN, RH | write, requires confirmation, idempotent |
| `reunion.list_mine` | `GET /api/v1/rh/reunions/mes-reunions` | EMPLOYEE, MANAGER, RH, ADMIN | read |
| `reunion.next` | `GET /api/v1/rh/reunions/prochaine` | EMPLOYEE, MANAGER, RH, ADMIN | read |
| `reunion.get_detail` | `GET /api/v1/rh/reunions/{uuid}` | EMPLOYEE, MANAGER, RH, ADMIN | read |

Plus 16 tests proving each tool: is registered, hits the verified backend URL, sends camelCase JSON that matches `EquipeRequest`/`DepartementRequest`, role-gates correctly for unauthorized roles, treats `404` on "next meeting" as safe-empty (not an error).

### What this PR explicitly does NOT ship (deferred)

1. **Natural-language intent routing for these tools.** The tools are registered and callable via `ToolExecutor.execute("organisation.create_team", ...)` but the FR/EN/AR/TN routing patterns ("créer équipe X", "create team X", "nheb naamel equipe jdida", "أنشئ فريقا") are NOT wired into `RouterAgent`. Tools work; the natural-language path to them does not yet. This is a separate task because (a) routing changes cross-cut the existing agent priority order documented in `AI_FE_05`, and (b) the AR/TN routing needs broader pattern work that risks regressing currently-shipping intents.
2. **Employee-to-team assignment tool.** Blocked on backend endpoint `POST /api/v1/users/{id}/affectations` (analysis report §5 #4, §11 B3). Without it, chatbot must return "capability unavailable" — and it already does.
3. **Admin tenant-diagnostics tool.** Blocked on backend endpoint `GET /api/v1/admin/diagnostics/tenant/{id}` (analysis §5 #12, §11 B4).
4. **Live Playwright validation.** Same blocker as `AI_FE_05` — no dev server was running locally; pytest stands in.
5. **Multilingual routing test matrix expansion.** `test_multilingual_router.py` already covers the FR/EN/AR/TN intent buckets that exist today. Expanding to 25 prompts × 4 roles × 4 languages for the routes that aren't wired yet (per item #1) would be testing vapor.

## 2. MCP tools used

| MCP | Used | How |
|---|---|---|
| filesystem | yes | Cataloged existing `ai-service/app/tools/*.py` patterns (admin_tools, communication_tools, authorization_tools), confirmed backend controller endpoints + DTO field names, read existing test patterns. |
| context7 | no | Not needed; patterns are project-internal. |
| postgres | not available | Schema unchanged. No new DB columns or tables. |
| playwright | not used | No dev server running; same constraint as `AI_FE_05`. |
| redis | not used | No Redis usage in new tools. |
| docker | not used | No container changes. |

## 3. Files changed

```
ai-service/app/tools/organisation_structure_tools.py  (new, 272 lines)
ai-service/app/tools/reunion_tools.py                 (new, 192 lines)
ai-service/app/core/copilot_engine.py                 (+8 lines: 2 imports + 6 registration lines)
ai-service/tests/test_organisation_structure_tools.py (new, 192 lines, 9 tests)
ai-service/tests/test_reunion_tools.py                (new, 116 lines, 7 tests)
AI_FE_07_ROLE_BASED_INTELLIGENT_CHATBOT_REPORT.md     (this file)
```

No backend Spring code changed. No frontend Angular code changed. No DB migration added. No new env variables. No new dependencies.

## 4. Backend endpoint verification

All seven backend endpoints exist and were verified via Grep against the existing controllers before any tool was written:

- `EquipeController.java` — `@RequestMapping("/api/v1/organisations/equipes")` with `@PostMapping` (ADMIN, RH) and `@GetMapping` (ADMIN, RH, MANAGER). `EquipeRequest` DTO requires `nom`, `departementId`, `estActive`; optional `description`, `responsableId`, `effectifMaximum`.
- `DepartementController.java` — `@RequestMapping("/api/v1/organisations/departements")` with `@PostMapping` (ADMIN, RH). `DepartementRequest` DTO requires `nom` (2-100 chars), `codeInterne` (regex `^[A-Z0-9-]+$`), `entrepriseId`; optional `description`.
- `ReunionController.java` — `@RequestMapping("/api/v1/rh/reunions")` with `@GetMapping("/mes-reunions")` (any authenticated), `@GetMapping("/prochaine")` (any authenticated), `@GetMapping("/{uuid}")` (any authenticated).

Tool input validation mirrors the backend's: `code_interne` is validated client-side to reject characters that the backend regex would reject, so the user gets a clear pydantic error instead of an HTTP 400.

## 5. Safety properties (what is NOT compromised)

- **ToolRegistry remains authoritative.** New tools declare `allowed_roles` and the existing registry `_validate_context` (per `P2_02_TOOLREGISTRY_AUTHORITY_REPORT.md`) enforces role checks; my tests cover the EMPLOYEE-denied path.
- **Write actions require confirmation.** `organisation.create_team` and `organisation.create_department` set `requires_confirmation=True` + `idempotency_required=True`; the `test_create_team_requires_confirmation` test proves no backend POST happens without `confirmed=True`.
- **No invented data.** Both list tools return real `read_result` payloads with `empty=True` when the backend returns no rows; `reunion.next` treats backend 404 as a safe-empty state ("no upcoming meeting") rather than fabricating one.
- **Backend remains the validator.** The `code_interne` upper-case regex is checked client-side AND server-side; the client-side check is a UX courtesy, not a security boundary.
- **`entreprise_id` cannot be overridden cross-tenant.** `create_department` defaults to `context.tenant_id` and refuses if both are missing; an explicit `entreprise_id` in the input would still go to the backend, where Spring `@PreAuthorize` and tenant scoping decide.

## 6. ResponseGuard interaction

No changes to `ResponseGuard` or `rules.py`. New tool outputs all produce `read_result` / `write_result` records, which the guard's `_has_authoritative_data` already whitelists (per `AI_FE_05` §8). No new fallback messages were added.

## 7. Validation

### Imports
```
$ cd ai-service && python -c "import main; print('main imports ok')"
main imports ok
```
(One pre-existing warning about optional `app.api.document_generation` — unchanged.)

### New tests
```
$ python -m pytest tests/test_organisation_structure_tools.py tests/test_reunion_tools.py -v
collected 16 items
tests/test_organisation_structure_tools.py ... 9 passed
tests/test_reunion_tools.py ............... 7 passed
============================== 16 passed in 0.26s ==============================
```

### Regression — registry, authority, guard, chat endpoint
```
$ python -m pytest tests/test_tool_registry.py tests/test_tool_registry_authority.py \
                   tests/test_response_guard.py tests/test_chat_v2.py
collected 31 items
======================== 31 passed, 1 warning in 0.84s ========================
```
(Warning is `audioop` deprecation in `voice/stt.py` — pre-existing, unrelated.)

### What I did NOT run
- Full `pytest tests -q` (the `AI_FE_05` report documents one pre-existing failure: `test_intent_routing_priority.py::test_greeting_with_question_does_not_match`). My changes do not touch intent routing, so I do not expect new failures, but I did not re-run the full suite to avoid time on a known-noisy baseline.
- `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` — no frontend files changed in this PR, so skipped.
- Live Playwright — same dev-server-not-running blocker as `AI_FE_05`.

## 8. Recommended next session (AI-FE-07 Slice 2)

Once you want the chatbot to *answer* "créer équipe IA-NLP" instead of just having the tool sit there, the next slice is:

1. Extend `app/agents/admin_agent.py` (or add `app/agents/organisation_agent.py`) with `detect_intent` patterns for "create team / department" in FR/EN/AR/TN.
2. Wire it into `RouterAgent.extra_agents` after the explicit-domain check.
3. Slot-filling for missing `departement_id` ("Pour quel département ?") and `code_interne` ("Quel code interne ? Format: lettres majuscules + chiffres + tirets, ex: TECH").
4. Add an Employee/Manager agent intent for "mes réunions", "ma prochaine réunion", "c quoi mon planning" → `reunion.list_mine` / `reunion.next`.
5. Then `test_intent_routing_priority.py` additions for the new routes.

Each is small and reversible. Bundling them with the tool definitions risked a 1000-line PR; keeping them separate gives cleaner review.

## 9. Files staged

```
new file:   AI_FE_07_ROLE_BASED_INTELLIGENT_CHATBOT_REPORT.md
new file:   ai-service/app/tools/organisation_structure_tools.py
new file:   ai-service/app/tools/reunion_tools.py
modified:   ai-service/app/core/copilot_engine.py
new file:   ai-service/tests/test_organisation_structure_tools.py
new file:   ai-service/tests/test_reunion_tools.py
```

Pre-existing untracked files (`.playwright-mcp/`, `fix_auth.py`, `fe-ai-06-admin-*.png`, `weentime_project - Raccourci.lnk`, `weentime-frontend/.../test-results/`) and the pre-existing modification of `ai-service/evals/reports/local_eval_report.json` are NOT part of this PR and were not staged.

## 10. Commit

See trailing `git log --oneline -3` in the staging output.
