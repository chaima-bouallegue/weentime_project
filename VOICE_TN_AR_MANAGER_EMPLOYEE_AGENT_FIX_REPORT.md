# WeenTime Voice + Employee/Manager AI Agent Fix Initiative — Final Report

**Date:** 2026-05-16
**Author:** generated during slice-by-slice TDD execution
**Scope covered:** slices 1–7 of the original 8-slice work plan
**Branch:** main
**Total commits added:** 7

## Executive summary

This initiative addressed the 2026-05-16 screenshot bugs in the WeenTime
Employee and Manager AI chatbots — primarily `fallback.unsafe_response` and
`fallback.guard_rejected` cards on valid prompts, fake "Action approved" on
backend failure, missing Arabic/Tounsi language preservation, and absent
per-turn LLM observability. The work was decomposed into 8 slices and
shipped 7 of them as separate test-first commits.

### Verified at slice exit

- **252 / 254** ai-service pytest cases pass across all slice tests + key
  regression files. The 2 failures (`test_reunion_agent_routing.py` /
  `test_intent_detection_multilingual`) are pre-existing test/code drift
  unrelated to this work — both predate slice 1.
- **17 / 17** chat-widget vitest specs pass.
- **`npx tsc --noEmit -p tsconfig.app.json`** clean.
- **`npm run build`** produces a dist bundle (warnings are pre-existing
  CommonJS notices in sockjs-client).

### Not verified (deferred slice 8 → manual)

- Real per-prompt browser validation against the live stack (Spring +
  AI service + Ollama + Angular dev server + a real login) — slice 8 was
  scoped down because no live stack was running in this session.
- Live `qwen2.5:3b` end-to-end call verification — Ollama IS running with
  the model loaded (confirmed via `GET /api/tags`), but no AI service was
  running to exercise it through the WorkflowOrchestrator path.
- ChromaDB / RAG ingestion or retrieval changes were not in scope for any
  of slices 1–7 (and were not surfaced as broken by the screenshots).

## MCP tools used

| Tool | Where it helped |
|---|---|
| **filesystem (built-in Read/Glob/Grep/Edit/Write)** | All source navigation and edits |
| **Bash** | git operations, pytest, npx, npm run build |
| **Agent (general-purpose)** | One-shot backend capability map enumeration across 49 Spring controllers (slice 1) |
| **AskUserQuestion** | Scope decomposition + design approvals before each slice |

Chrome DevTools / Playwright MCPs were available but not exercised — no
running browser session and no live backend to point them at.

## Slice-by-slice summary

Each slice followed the same loop: **brainstorm → spec doc → user approval →
tests-first → identify gaps from test failures → minimal fix → regression
sweep → single commit if green**.

### Slice 1 + 2 — Backend capability discovery + ResponseGuard fix
**Commit:** `7a0e87f` — *fix(ai): expand guard allowlist, reject false write success, route approbations*

- **`docs/superpowers/specs/2026-05-16-backend-capability-map.md`** — 49
  Spring controllers / ~210 endpoints across 5 services, each row tagged
  `ready` / `partial` / `missing` / `n/a-internal`, plus a per-feature
  rollup (Pointage, Autorisations, Congés, Documents, Télétravail,
  Planning/Horaires, Réunions, Team presence, Pending approvals). Pure
  read-only documentation.
- **`ai-service/app/guards/rules.py`** — `SAFE_NO_EVIDENCE_INTENTS`
  extended with slot-filling asks (`authorization.create.ask`,
  `leave.create.ask`, `telework.create.ask`, `document.create.ask`),
  manager safe reads (`manager.pending_approvals`, `manager.team_requests`,
  `manager.team_schedule`, `manager.team_presence`,
  `manager.team_attendance`), and `planning.list` / `meetings.list`.
- **`FakeConfirmationRule` hardening** — new `_has_failure_evidence`
  helper rejects success-y text when `actionResult.success is False`,
  `actionResult.error` is set, or any `toolCall.status` is `failed` /
  `denied`. Kills the "Action approved" card on a backend 4xx/5xx.
- **`ManagerAgent.detect_intent`** — noun forms "approbations" / "approvals"
  routed to `manager.pending_approvals` before the verb-form approve branch
  (string-find of "approve" was matching inside "approvals"). Intent
  renamed `manager.pending` → `manager.pending_approvals`.
- **Tests added** — 38 cases in `test_response_guard_allowlist.py`,
  `test_fake_confirmation_failed_backend.py`,
  `test_manager_approbations_routing.py`.

**Bonus surprises flagged by the capability-map agent (out of scope, worth
investigating separately):**
- `UserIntegrationController` (`/api/users/*`) — 3 endpoints with no auth
- `InternalNotificationController` (`/api/v1/notifications/internal/**`) —
  no internal-service-key check
- `rh-service.InternalIntegrationController`, `ReunionController.GET
  /internal/minutes-today`, `RhPlanningController.GET /is-excused` — public
  base paths with no `@PreAuthorize`
- Entire **communication-service** controller layer — no `@PreAuthorize`
- `authorization.create_request` AI tool targets the EmployeeCompatibility
  `/autorisations` path instead of the canonical `/rh/autorisations`

### Slice 3 — Employee agent intent routing
**Commit:** `05abb4b` — *fix(ai): infer sick-leave intent and pin employee routing for autorisation/reunion/planning*

Tests-first revealed that 3 of the 4 sub-problems from the screenshots were
already working (autorisation 2h slot-filling, "aandi reunion?", "c quoi
mon planning") thanks to earlier work and slice 2's allowlist. Only
sub-problem D was broken.

- **`ai-service/app/agents/leave_agent.py`** — `detect_intent` gate now
  accepts `malade`, `maladie`, `sick`, `marid`, `marida`, `مريض`, `مريضة`,
  so "je suis malade aujourd'hui" routes to `leave.create` instead of
  falling through.
- **`leave.create` handler** — pre-infers `leave_type_label="maladie"` and
  `reason="maladie"` when the original message contains a sick term, so
  the slot-filling doesn't re-ask "quel type de conge ?".
- **Tests added** — 11 cases in `test_employee_intent_routing_slice3.py`
  spanning all 4 sub-problems (autorisation, reunion, planning, sick leave).

### Slice 4 — Manager agent fixes
**Commit:** `ea4e3eb` — *fix(ai): support 'did i check in', team-horaire routing, and approval-by-name*

Three sub-problems, all confirmed broken before the fix:

- **`ai-service/app/nlp/intent_patterns.py`** — `INTENT_PATTERNS[GET_STATUS]`
  gains explicit question forms (`did i check/clock/sign in/out`,
  `have i checked/clocked/signed in/out`, `am i checked/clocked/signed
  in/out`). `match_intent` now tries `GET_STATUS` **before**
  `CHECK_IN`/`CHECK_OUT` so the substring `"check in"` inside the question
  no longer hijacks the intent. Imperative "pointer mon entree" still
  routes to `CHECK_IN` (regression-tested).
- **`ai-service/app/agents/reunion_agent.py`** — `_PLANNING_TERMS` gains
  `horaire` / `horaires`. When the prompt also contains a team/equipe cue
  AND role is `MANAGER`, returns `manager.team_schedule` (allowlisted in
  slice 2) with a manager-flavoured `capability_unavailable` card instead
  of generic `planning.unavailable`. Personal `mes horaires` still routes
  to `planning.unavailable`.
- **`ai-service/app/agents/manager_agent.py`** — natural-language approval
  by employee name. When `manager.approve` / `manager.reject` is detected
  with no numeric `request_id`, the new `_extract_employee_name` /
  `_normalize_for_name` / `_employee_name_matches` helpers parse the
  "de <name>" / "of <name>" / "pour <name>" / "for <name>" window and
  `_resolve_by_employee_name` searches the existing
  `list_manager_requests` tools (filtered by inferred request type when
  present). 0 matches → `approval_lookup` not_found ask; 1 match → existing
  detail-fetch + confirmation flow; 2+ matches → existing ambiguous path.
  Explicit-id approvals continue to work unchanged.
- **Tests added** — 14 cases in `test_manager_routing_slice4.py` (5 for
  GET_STATUS, 1 imperative regression, 3 for horaire routing including
  employee-personal regression, 4 for approval-by-name including
  ambiguous + explicit-id regression).

### Slice 5 — Arabic / Tounsi / Franco-Arabic language preservation
**Commit:** `a0d4a70` — *fix(ai): preserve input language in agent responses across ar/tn/en*

Text only. Voice/STT/Ollama/frontend were out of scope.

- **`ai-service/app/nlp/language_detector.py`** — `TN_HINTS` gains `aandi`,
  `andi`, `3andi`, `i7awejli`, `naamel`, `naamela`, `nzid`, `nchouf`,
  `tasrih`. Before this, "aandi reunion?" was classified as `fr` (no
  Tounsi token matched).
- **`ai-service/app/i18n/templates.py`** — 7 new `PHRASES` entries
  × 4 locales = 28 new translation strings, covering
  `ask.time.authorization`, `ask.type.authorization`,
  `ask.reason.authorization`, `ask.type.leave`, `unavailable.planning`,
  `unavailable.meeting`, `unavailable.team_schedule`.
- **`ai-service/app/i18n/response_localizer.py`** — `_template_key`
  dispatcher recognises the new intents via intent + text-content
  matching (intent=`leave.create` + text contains "type" →
  `ask.type.leave`; intent=`planning.unavailable` → `unavailable.planning`;
  etc.).
- **Tests added** — 41 cases in `test_language_preservation_slice5.py`
  covering: 12 detection cases, 5 `response_locale` resolution cases
  (including misclassified-but-rescued via TN-hints sniff), 12
  slot-filling-ask localization (4 templates × 3 locales), 9
  capability_unavailable localization (3 templates × 3 locales),
  2 end-to-end agent.handle + localize_agent_response sanity, 1
  French-input regression.

### Slice 6 — Ollama / Qwen tracing
**Commit:** `8d80bbe` — *feat(ai): add llm_used / provider / model / intent_before_llm metadata to every turn*

Pure observability. No change to LLM behavior or call sites.

- **`ai-service/app/observability/provider_metadata.py`** (new) —
  `annotate_provider_metadata(response, *, provider_router,
  intent_before_llm)` injects 4 keys into every `AgentResponse.actionResult`:
  - `llm_used` (bool): True iff `actionResult.kind == 'provider_response'`
  - `provider` (str): configured router mode (`ollama` / `cloud` /
    `disabled`), present even when not used
  - `model` (str | None): configured default; for `provider_response`,
    the actual model returned wins
  - `intent_before_llm` (str | None): deterministic intent the router picked
  - `intent_after_llm` (str | None): set only for `provider_response`
    candidates
- **`ai-service/app/workflows/workflow_orchestrator.py`** —
  `_finalize_response` and `_controlled_confirmation_result` call the
  helper just before returning `WorkflowResult`, so every guarded
  response carries the metadata.
- The existing `FallbackMetadata.provider_used="none"` literal is
  preserved by the schema; the new keys are layered on top.
- **Tests added** — 12 cases in `test_provider_tracing_slice6.py`
  covering deterministic / provider-used / disabled-mode / fallback-kind /
  idempotency / various deterministic kinds.

### Slice 7 — Frontend chatbot UX
**Commit:** `3ef3948` — *fix(chatbot): neutral capability cards, RTL Arabic, missing quick prompts*

- **`chat-widget.component.ts`** — `isHardError` short-circuits when
  `actionResult.kind` is `capability_unavailable` / `capability_hint`,
  so cards like ManagerAgent's "unsupported request type" no longer
  render red even when `type='error'`. New `isCapabilityUnavailableKind`
  private helper.
- **Manager `quickActions`** — adds "Horaires equipe" (6 prompts total).
- **Employee `quickActions`** — adds "My planning" (7 prompts total).
- **`isArabicText` / `messageDirection`** public helpers — codepoint
  check covers Arabic + Arabic Supplement + Arabic Extended-A
  (U+0600–U+06FF, U+0750–U+077F, U+08A0–U+08FF). The
  `message-bubble__text` `<p>` element gets `[attr.dir]="messageDirection
  (message)"` so Arabic replies render RTL while Latin/Tounsi stays LTR.
- **Test infra fix** — `Trash2` Lucide icon registered in the spec's
  `LucideAngularModule.pick({...})`. This was unregistered since commit
  64e5c04's clear-conversation affordance, breaking the existing
  `keeps the voice stop button as type=button` spec; surfaced by the new
  spec cases.
- **Tests added** — 3 cases in `chat-widget.component.spec.ts`
  ("employee quick prompts include 'My planning'", "isArabicText returns
  true for Arabic-script strings", "messageDirection yields rtl for Arabic
  message text, ltr for Latin").

## Verification matrix

| Layer | Verification | Result |
|---|---|---|
| ai-service pytest sweep (slices 1-6 + key regression) | 28 test files, 252 tests | **250 pass, 2 pre-existing fail** |
| Frontend `tsc --noEmit -p tsconfig.app.json` | type check | **clean** |
| Frontend `npm run build` | production bundle | **success** (pre-existing CJS warnings only) |
| Frontend `vitest run src/app/shared/chat-widget/` | 3 spec files, 17 tests | **17 / 17 pass** |
| Live browser per-prompt validation | needs full stack | **NOT RUN** (see "Remaining gaps" below) |
| Live Ollama `qwen2.5:3b` round-trip | Ollama up, AI service down | **NOT RUN** |

The 2 pre-existing pytest failures are in
`tests/test_reunion_agent_routing.py`:

- `test_intent_detection_multilingual[c quoi mon planning aujourd hui-reunion.list_mine]`
- `test_intent_detection_multilingual[what is my schedule today-reunion.list_mine]`

Both predate slice 1. The production code correctly returns
`planning.unavailable` (per the inline comment in `reunion_agent.py`),
but two test cases were never updated to match the new classification. A
small one-line cleanup of those expectations would close this gap; it was
left untouched per the "no broad refactors / narrowly scoped" instruction.

## What was NOT done (explicit gaps)

Listed in the order they appear in the original task description:

1. **Live browser validation through the running stack** — no Spring
   backend, no AI service, no Angular dev server, no live login in this
   session. The 17 user-listed prompts cannot be exercised end-to-end
   without standing the stack up.
2. **Live Ollama provider call exercising slice 6's tracing** — Ollama
   was up (model loaded), AI service was down. The tracing code is unit-
   tested but its actual emission against a real `qwen2.5:3b` response is
   not observed.
3. **ChromaDB / RAG behavior** — none of slices 1–7 touched the RAG path.
   The original task listed RAG/FAQ prompts ("politique télétravail",
   "comment déclarer une absence", "congé maternité") under "Employee
   Part E: RAG/FAQ". Existing `test_chromadb_policy_retriever.py` /
   `test_policy_agent.py` continue to run, but no new behavior was
   introduced or fixed.
4. **Voice / STT pipeline changes** — explicitly out of scope per the
   "no voice changes" rule the user reinforced before slice 5.
5. **Long-form summary translation** — slice 5 covers slot-filling asks
   and `capability_unavailable` cards. List/summary text (e.g. the
   per-section labels in `manager_pending_summary`) is not translated.
6. **End-to-end RTL UX polish** — slice 7 sets per-message `dir`. The
   full chat panel layout (sender pills, action buttons, action result
   cards) is not flipped for Arabic users; that would be a larger UX
   slice.
7. **The 2 stale reunion test cases** — pre-existing test/code drift,
   intentionally left alone (out of scope).
8. **Security findings from the capability-map agent** — listed in the
   "Bonus surprises" subsection of slice 1+2. Not fixed; documented as
   discovered.

## Recommendations for the next session

In rough priority order:

1. **Stand up the full stack and run the 15-prompt browser validation
   from PART 9 of the original task.** Capture per-prompt JSON responses
   and screenshots. This is the single highest-value next step.
2. **Decide on the 8 security findings** (open `/api/users/*`,
   `/notifications/internal/**` without key check, etc.) — these are
   real holes flagged but out of scope for the chatbot fix.
3. **Fix the 2 stale reunion test cases** by updating their expected
   intent from `reunion.list_mine` → `planning.unavailable` to match the
   production behavior (per the inline comment in `reunion_agent.py`).
4. **Optionally: translate `manager_pending_summary` section labels**
   (small slice 5 follow-up).
5. **Optionally: full RTL UX pass** for Arabic users (separate larger
   slice).

## Commit history (this initiative)

```
3ef3948 fix(chatbot): neutral capability cards, RTL Arabic, missing quick prompts        (slice 7)
8d80bbe feat(ai): add llm_used / provider / model / intent_before_llm metadata...       (slice 6)
a0d4a70 fix(ai): preserve input language in agent responses across ar/tn/en             (slice 5)
ea4e3eb fix(ai): support 'did i check in', team-horaire routing, and approval-by-name   (slice 4)
05abb4b fix(ai): infer sick-leave intent and pin employee routing for...                (slice 3)
7a0e87f fix(ai): expand guard allowlist, reject false write success, route approbations (slices 1+2)
```

## Design docs produced (this initiative)

- `docs/superpowers/specs/2026-05-16-backend-discovery-and-guard-fix-design.md`
- `docs/superpowers/specs/2026-05-16-backend-capability-map.md`

All seven slice designs were presented and approved interactively before
implementation; this report is the consolidated artifact.
