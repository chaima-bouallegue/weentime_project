# Backend Capability Discovery + ResponseGuard Fix — Design

**Date:** 2026-05-16
**Scope:** Slice 1 + Slice 2 of the larger WeenTime voice + agents fix initiative.
**Owner:** ai-service + docs.
**Status:** Approved (pending user spec review).

## Context

Screenshots of the Employee and Manager chatbots show two recurring failure modes:

- `fallback.unsafe_response` — agents bail out to the catch-all deterministic fallback when they cannot decide what to do (e.g. "approbations", "nheb naamela autorisation de 2h").
- `fallback.guard_rejected` — `ResponseGuard` rejects an otherwise sensible agent reply because its intent or text shape is not in the safe-no-evidence allowlist (e.g. "aandi reunion?", "nheb nchouf les horaire de l equipes").

A separate user-visible bug: a failed backend autorisation create call rendered as "Action approved", because `FakeConfirmationRule` only checks that *some* tool evidence exists, not that the evidence indicates success.

The downstream work (intent routing for employee/manager, multilingual voice, Ollama tracing, frontend polish, full browser validation) cannot proceed coherently without two pieces in place:

1. A single source of truth describing what the Spring backend can actually do today — so future agent work knows when to call a real endpoint vs return `capability_unavailable`.
2. A guard that does not reject deterministic, template-driven responses, and does not let a failed backend write masquerade as success.

This slice delivers both, scoped narrowly to keep blast radius small.

## Goals

- Produce a Markdown capability map of every public REST endpoint in the 5 Spring services, classified by AI readiness.
- Eliminate the guard-rejection class of fallbacks for response types that are deterministic by construction.
- Make `FakeConfirmationRule` reject success-y text when the underlying tool call failed.
- Fix the single most visible routing miss (`approbations` → `fallback.unsafe_response`) with the smallest possible change.

## Non-Goals

- New tool implementations (deferred to slices 3/4).
- Arabic / Tounsi language preservation (slice 5).
- Ollama / Qwen provider tracing (slice 6).
- Frontend chatbot card UX (slice 7).
- Browser validation, full multilingual test sweeps, comprehensive report (later).

## Deliverables

### D1 — Backend capability map (Markdown)

**Path:** `docs/superpowers/specs/2026-05-16-backend-capability-map.md`

**Structure:**

- **Per-service section** (auth-service, organisation-service, presence-service, rh-service, communication-service). Each section lists every `@RestController` class and its endpoints in a table:

  | Method | Path | `@PreAuthorize` roles | Purpose | Request / Response DTO | Mapped AI tool | AI readiness | Gap notes |

  *AI readiness* uses one of four values:

  - **ready** — tool exists in `ai-service/app/tools/`, payload shapes match, currently called by an agent.
  - **partial** — tool exists but is missing fields, mis-mapped, or only called for some roles.
  - **missing** — endpoint exists, no AI tool wraps it; an agent should return `capability_unavailable` until a tool is added.
  - **unavailable** — endpoint does not exist (used when the capability map is referenced from agent code to justify a `capability_unavailable` for a feature the backend cannot satisfy at all).

- **Per-feature rollup** at the bottom: Pointage, Autorisations, Congés, Documents, Télétravail, Planning / Horaires, Réunions, Team presence, Pending approvals. Each rollup says which prompts return real data today, which need `capability_unavailable`, and which need new tools in slice 3/4.

**Scope of enumeration:** every controller under `weentime-backend/services/*/src/main/java/**/controller/*.java`. Internal-only controllers (`Internal*Controller.java`) are listed under a separate sub-heading per service so they are not confused with public-facing endpoints.

**Mapped AI tool column source:** read `ai-service/app/tools/*.py` and the `ToolRegistry` registration to populate. If a tool's `backend_client` call shape diverges from the controller's request body, the row gets *partial* with the divergence noted.

**No code is changed** by this deliverable.

### D2 — ResponseGuard allowlist additions

**File:** `ai-service/app/guards/rules.py`
**Change:** add intents to `SAFE_NO_EVIDENCE_INTENTS`. Rule for inclusion: the intent's agent produces text from a template or structured ask — never from LLM-generated HR values.

Intents to add (grouped):

- **Slot-filling asks** (the agent is collecting missing fields, not making claims):
  `authorization.create.ask`, `leave.create.ask`, `telework.create.ask`, `document.create.ask`
- **Manager safe reads** (the agent returns a deterministic structure summarising tool output, OR a `capability_unavailable` when the tool is missing):
  `manager.pending_approvals`, `manager.team_schedule`, `manager.team_presence`, `manager.team_attendance`
- **Attendance reads** (template text reflecting tool result):
  `attendance.status`, `attendance.forgotten_checkout`
- **Planning / meetings list intents** (the existing `*.unavailable` variants are already allowlisted; add the success-path intent names so the guard does not reject a real list):
  `planning.list`, `meetings.list`

Each added intent is justified by a one-line comment in the source code linking it to its agent + the deterministic origin of its text.

### D3 — FakeConfirmationRule hardening

**File:** `ai-service/app/guards/rules.py`, class `FakeConfirmationRule`.

**New behaviour:** before allowing a response whose text contains a write-success phrase, check the action result and tool calls for explicit failure markers. Reject if any of these are true:

- `response.actionResult.success is False`
- `response.actionResult.error` is a non-empty value
- any `toolCall.status == "failed"` or `"denied"`

The existing positive-evidence check (`_has_successful_action_evidence`) remains the precondition for `execute_action`; the new check is an additional veto layered on top.

**Effect:** a backend 4xx/5xx wrapped into `actionResult={success: False, error: "..."}` can no longer be rendered as "Action approved" / "checked in" / etc.

### D4 — `approbations` routing fix (one bug only)

**Investigation step:** read `ai-service/app/agents/manager_agent.py`, `ai-service/app/agents/router_agent.py`, and the intent patterns in `ai-service/app/nlp/intent_patterns.py` to determine where "approbations" currently dies. The fix path is chosen after reading:

- **Path A — existing tool, missing pattern:** if `manager.pending_approvals` (or an equivalent tool) already exists and is reachable, add a pattern entry mapping `approbations`, `approvals`, `pending approvals`, `demandes à valider`, `validations en attente` to the existing manager pending-approvals intent. Change scoped to `intent_patterns.py` + at most a small dispatch line.
- **Path B — no tool exists:** add a deterministic short-circuit in `manager_agent.py` (or `router_agent.py`) that recognises the same phrases and returns an `AgentResponse` with intent `manager.pending_approvals`, type `error` or `info`, and a `capability_unavailable`-style text indicating the feature is not wired yet. No fake list, no fake count.

**Bail-out condition:** if neither path can be implemented in ≤ ~50 lines across ≤ 2 files, the implementation stops, the situation is recorded in the commit body, the routing fix is deferred to slice 4, and `test_manager_approbations_routing.py` is also dropped from this slice. The capability-map + guard fixes (D1 + D2 + D3 + their two test files) still ship.

### D5 — Targeted tests

All under `ai-service/tests/`:

- `test_response_guard_allowlist.py` — for each newly allowlisted intent, construct an `AgentResponse` with template text + empty `toolCalls`, run it through `ResponseGuard.guard_response`, assert the response is returned unchanged (no fallback substitution).
- `test_fake_confirmation_failed_backend.py` — three cases: `success=False` + success text → rejected; `error="..."` + success text → rejected; control case (no success text, failed backend) → allowed.
- `test_manager_approbations_routing.py` — feed the phrases "approbations", "approvals", "pending approvals", "demandes à valider" through whichever entry point Path A or Path B uses. Assert the resulting intent is `manager.pending_approvals` (or its capability-unavailable variant) and that the intent is NOT `fallback.unsafe_response`.

Tests are kept self-contained: they instantiate `ResponseGuard` directly and build `AgentResponse` fixtures, no FastAPI test client, no live backend.

### D6 — One commit if tests pass

After all four code changes (D2 + D3 + D4 + D5) and the doc (D1), run:

```
cd ai-service
python -m pytest tests/test_response_guard_allowlist.py tests/test_fake_confirmation_failed_backend.py tests/test_manager_approbations_routing.py -v
```

Plus the existing guard test files for regression. Only if all green: create one commit with the capability-map doc, the guard rule changes, the routing fix, and the new tests. Commit message:

```
fix(ai): expand guard allowlist, reject false write success, route approbations

- Add deterministic-template intents (slot-filling asks, manager reads,
  attendance reads, planning/meetings list) to SAFE_NO_EVIDENCE_INTENTS
- Reject success-y text when actionResult/toolCalls indicate failure
- Route "approbations" to manager.pending_approvals (or capability_unavailable)
- Backend capability map under docs/superpowers/specs/
```

No `git add .`; explicit per-file staging only.

## Risk + Rollback

- **Risk:** an over-broad allowlist could let a future agent ship LLM-invented HR values under one of these intents. Mitigated by per-intent inline comments stating the deterministic origin, and by leaving `HallucinatedHrValueRule` + `UnsupportedToolClaimRule` in place — they still fire on text content.
- **Risk:** the `approbations` routing fix may turn out to need a new backend call, blowing the ≤ 50-line budget. Mitigated by the explicit Path-A / Path-B / bail-out clause.
- **Rollback:** single commit, `git revert <sha>` restores prior state.

## Out of Scope (Tracked for Later Slices)

| Slice | Description |
|-------|-------------|
| 3 | Employee agent intent routing (autorisation slot-filling, meeting/planning, sick-leave reason) |
| 4 | Manager agent fixes (personal vs team routing, natural approval-by-name) |
| 5 | Arabic / Tounsi / Franco-Arabic language preservation |
| 6 | Ollama / Qwen tracing + provider verification |
| 7 | Frontend chatbot UX (neutral capability card, no fake approved, RTL) |
| 8 | End-to-end browser validation + per-prompt report |
