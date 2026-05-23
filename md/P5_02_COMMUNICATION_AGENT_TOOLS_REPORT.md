# P5-02 CommunicationAgent Tools Report

## Summary
Activated the modern CommunicationAgent MVP with safe communication-service tools for channel listing, channel message reads, deterministic summaries, and confirmed message sending.

This task did not add Redis, n8n, LangGraph, ChromaDB, meetings, voice messages, frontend changes, or backend service changes.

## Files Changed
- ai-service/app/agents/communication_agent.py
- ai-service/app/tools/communication_tools.py
- ai-service/app/core/copilot_engine.py
- ai-service/app/guards/rules.py
- ai-service/tests/test_communication_agent.py

## Endpoints Verified
Verified from communication-service controllers and services:

- GET /api/v1/communication/channels
  - Controller: ChannelController.getChannels
  - Backend method: ChannelService.listChannels
  - Security behavior: derives current user from SecurityUtils.currentUser(); asserts tenant context; returns only visible active channel memberships for the authenticated user and enterprise.

- GET /api/v1/communication/channels/{channelId}
  - Controller: ChannelController.getChannel
  - Backend method: ChannelService.getChannel
  - Security behavior: asserts tenant context and active channel membership.

- GET /api/v1/communication/channels/{channelId}/messages?limit=&before=
  - Controller: MessageController.getMessages
  - Backend method: MessageService.getMessages
  - Security behavior: asserts tenant context and active channel membership before returning cursor-paged messages.

- POST /api/v1/communication/channels/{channelId}/messages
  - Controller: MessageController.sendMessage
  - DTO: SendMessageRequest(clientMessageId, type, body, richBody, parentMessageId, mentions, metadata)
  - Backend method: MessageService.sendMessage
  - Security behavior: asserts tenant context, active membership, and write permission. Idempotency is supported through clientMessageId.

## Tools Added
Registered via ToolRegistry:

- communication.list_channels
  - Type: read
  - Roles: EMPLOYEE, MANAGER, RH, ADMIN
  - Endpoint: GET /communication/channels
  - Confirmation: no

- communication.get_channel_messages
  - Type: read
  - Roles: EMPLOYEE, MANAGER, RH, ADMIN
  - Endpoint: GET /communication/channels/{channelId}/messages
  - Confirmation: no

- communication.summarize_channel
  - Type: read
  - Roles: EMPLOYEE, MANAGER, RH, ADMIN
  - Endpoint source: GET /communication/channels/{channelId}/messages
  - Confirmation: no
  - Summary mode: deterministic, local, based only on returned visible messages.

- communication.send_message
  - Type: write
  - Roles: EMPLOYEE, MANAGER, RH, ADMIN
  - Endpoint: POST /communication/channels/{channelId}/messages
  - Confirmation: yes
  - Idempotency: required; request_id is forwarded as clientMessageId when available.

## Routing Changes
- CommunicationAgent now detects supported communication intents:
  - list channels
  - read latest channel messages
  - summarize channel / what did I miss
  - send message
- Copilot engine now registers communication tools and includes CommunicationAgent in the v2 router before role copilots and legacy fallback.
- LegacyAgent remains the last fallback for unrelated prompts.

## Confirmation Behavior
- Read tools execute directly through ToolExecutor after verified context and role validation.
- communication.send_message returns confirm_action from CommunicationAgent.
- ToolExecutor still blocks direct write execution without confirmed=True.
- The provider/Ollama path cannot execute communication tools directly.

## Provider And Guard Usage
- No provider behavior was added or enabled.
- ResponseGuard was extended so unsupported tool claim detection includes communication.* tool names.
- Deterministic summaries do not rely on Ollama and do not invent hidden messages.

## Error Handling
- 401/403: clean permission denied message.
- 404: clean channel/message not found message.
- 400: invalid channel/message input message.
- 5xx/unreachable: communication service unavailable message.
- Raw backend technical text is not surfaced in user-facing summaries.

## Tests Added Or Updated
Added ai-service/tests/test_communication_agent.py covering:
- list channels routes to CommunicationAgent
- list channels calls verified backend endpoint
- get channel messages calls modern tool endpoint
- summarize channel uses visible messages only
- empty channel returns clean empty state
- send message creates confirmation
- send message does not execute directly
- confirmed send calls backend without prompt-provided user/tenant data
- unauthorized channel returns clean 403
- backend 404 returns clean not-found response
- CommunicationAgent no longer returns placeholder for supported intents
- LegacyAgent still handles unrelated prompts

Updated ai-service/app/guards/rules.py to include communication.* in unsupported tool claim detection.

## Validation Results
Commands run from C:\Users\DELL\Documents\GitHub\weentime_project\ai-service:

- python -c "import main; print('ok')"
  - Result: ok

- python -m pytest tests/test_communication_agent.py tests/test_tool_registry.py -v
  - Result: 15 passed

- python -m pytest tests/test_chat_v2.py tests/test_response_guard.py tests/test_deterministic_fallback.py -v
  - Result: 27 passed, 1 warning from voice/stt.py audioop deprecation

- python -m pytest tests/test_communication_agent.py tests/test_tool_registry.py tests/test_chat_v2.py tests/test_response_guard.py tests/test_deterministic_fallback.py -v
  - Result: 42 passed, 1 warning from voice/stt.py audioop deprecation

Backend communication-service compile was not run because no backend files were changed.

## Remaining Limitations
- Channel references currently require a UUID in the prompt or channel_id metadata from the caller. Name-based channel resolution is intentionally deferred to avoid guessing the wrong private channel.
- Summaries are deterministic and simple; semantic summarization through a provider can be layered later after strict guard and visibility checks.
- Send message only supports plain text body in this MVP. Attachments, mentions, edits, deletes, reactions, and channel creation remain out of scope.
- Membership validation is delegated to communication-service as the authority.

## Exact Files Staged
Pending staging at report creation time:
- ai-service/app/agents/communication_agent.py
- ai-service/app/tools/communication_tools.py
- ai-service/app/core/copilot_engine.py
- ai-service/app/guards/rules.py
- ai-service/tests/test_communication_agent.py
- P5_02_COMMUNICATION_AGENT_TOOLS_REPORT.md

## Commit Hash
Pending commit at report creation time. Final commit hash is reported in the task completion message.
