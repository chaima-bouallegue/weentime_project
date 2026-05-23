# P6-02 Notification Pipeline Report

## Summary
Implemented a safe realtime notification fanout bridge in `communication-service` using the existing Redis/websocket backbone from P6-01. The service now converts persisted notification events into tenant/user-scoped realtime events while keeping PostgreSQL, organisation-service notifications, and backend business services authoritative.

## Files Changed
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/dto/NotificationCategory.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/dto/NotificationEventTypes.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/dto/RealtimeNotificationPayload.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/NotificationDispatchService.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RealtimeEventService.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RedisRealtimeEventPublisher.java`
- `weentime-backend/services/communication-service/src/test/java/com/weentime/communication/service/RedisRealtimeEventPublisherTest.java`
- `weentime-backend/services/communication-service/src/test/java/com/weentime/communication/dto/RealtimeNotificationPayloadTest.java`

## Notification Architecture
Existing flow retained:
1. `MessageService` creates authoritative communication messages in PostgreSQL.
2. `NotificationDispatchService` persists `CommNotificationEvent` rows and records `notification.dispatch` outbox entries for organisation-service notification delivery.
3. P6-02 additionally queues a `notifications.created` realtime event through `RealtimeEventService`.
4. `RealtimeEventService` persists replayable `CommEventStream` rows and records `websocket.fanout` outbox entries.
5. `RedisRealtimeEventPublisher` publishes tenant-scoped envelopes to Redis when enabled, or falls back to local websocket dispatch when Redis publish fails.

Redis remains fanout infrastructure only. It does not store authoritative notifications, users, pointage, leave balances, approvals, or audit state.

## Websocket Fanout Behavior
- Notification events are emitted as user-scoped websocket events with type `notifications.created`.
- Payload includes the business event type, category, title, message, action URL, channel ID, message ID, recipient, tenant, and created timestamp.
- Existing websocket session delivery remains per user through `LocalRealtimeDispatcher.dispatchUserEvent`.
- Replay remains tenant-filtered through `CommEventStreamRepository` and current websocket replay visibility rules.

## Redis Usage
Redis envelopes now preserve canonical event names when the event type is already namespaced:
- `notifications.created`
- `notifications.read`
- `communication.message.created`
- `communication.mention.created`
- `leave.request.*`
- `telework.request.*`
- `authorization.request.*`

Legacy websocket message event names such as `message.created` still map to `communication.message.created` for Redis consumers.

## Fallback Behavior
- Redis is still optional and controlled by existing `communication.redis.enabled` configuration.
- If Redis publish fails, the publisher logs safe metadata only and falls back to local websocket dispatch.
- If realtime notification queuing fails while creating the notification, notification persistence and organisation-service dispatch are preserved; the service logs `fallback=outbox_only` with event type, tenant, recipient, and exception class only.

## Tenant Isolation Strategy
- Realtime notification payloads carry `entrepriseId` from the persisted communication message and notification event.
- Delivery target is the recipient user ID derived from active channel membership, not from prompt/frontend input.
- Mention and channel message notifications are generated only for active channel members already filtered by the communication-service membership model.
- Redis envelope fields include tenant ID, actor user ID if available, event version, source service, scope, target, and timestamp.

## Notification Categories
Added stable notification categories:
- `INFO`
- `WARNING`
- `SUCCESS`
- `ERROR`
- `ACTION_REQUIRED`

Current mapping:
- `communication.mention.created` -> `ACTION_REQUIRED`
- `communication.message.created` -> `INFO`

## Event Types Supported
Defined event constants for the required pipeline:
- `notifications.created`
- `notifications.read`
- `leave.request.submitted`
- `leave.request.approved`
- `leave.request.rejected`
- `telework.request.updated`
- `authorization.request.updated`
- `communication.message.created`
- `communication.mention.created`

This task wires communication message and mention notifications. Leave, telework, authorization, and document-producing services can publish the same canonical event names later without changing Redis semantics.

## Tests Added/Updated
Added backend unit tests:
- `RedisRealtimeEventPublisherTest`
  - verifies tenant-scoped `notifications.created` Redis envelope schema
  - verifies Redis failure falls back to local user websocket dispatch
  - verifies legacy `message.created` maps to `communication.message.created`
- `RealtimeNotificationPayloadTest`
  - verifies mention payload carries tenant, recipient, event type, and `ACTION_REQUIRED` category

## Validation Results
Passed:
- `cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\communication-service && .\mvnw.cmd "-Dtest=RedisRealtimeEventPublisherTest,RealtimeNotificationPayloadTest" test`
  - Result: 4 passed, build success.
- `cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\communication-service && .\mvnw.cmd clean compile -DskipTests`
  - Result: build success.
- `cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service && python -c "import main; print('ok')"`
  - Result: `ok`.

Repo-wide AI suite:
- `cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service && python -m pytest tests -v`
  - Result: 356 passed, 14 failed.
  - Failures are in pre-existing AI context/confirmation/voice tests and are unrelated to P6-02 backend realtime notification changes:
    - `tests/test_confirmation_error_handling.py` confirmation envelope tests
    - `tests/test_request_correlation.py` request ID tests
    - `tests/test_slot_filling_flows.py` compatibility `Claims.verified` failures
    - `tests/test_voice_contract.py` JWT 401 failures
  - These failures match the known AI baseline failures documented after P6-01 and were not modified by this task.

## Remaining Limitations
- HR service event sources for leave, telework, authorization, and document updates are not wired in this task; this task defines canonical event names and infrastructure support.
- `notifications.read` is exposed as a realtime event type helper but no read endpoint was added here.
- Redis remains optional; distributed websocket scaling beyond pub/sub fanout is still a later production hardening task.
- Full AI pytest suite remains red due unrelated pre-existing failures and should be addressed in the AI context/voice backlog, not inside P6-02.

## Exact Files Staged
Planned targeted staging only:
- `P6_02_NOTIFICATION_PIPELINE_REPORT.md`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/dto/NotificationCategory.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/dto/NotificationEventTypes.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/dto/RealtimeNotificationPayload.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/NotificationDispatchService.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RealtimeEventService.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RedisRealtimeEventPublisher.java`
- `weentime-backend/services/communication-service/src/test/java/com/weentime/communication/service/RedisRealtimeEventPublisherTest.java`
- `weentime-backend/services/communication-service/src/test/java/com/weentime/communication/dto/RealtimeNotificationPayloadTest.java`

## Commit Hash
Pending commit: `feat(realtime): add notification event pipeline`
