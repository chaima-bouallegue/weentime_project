# P6-01 Redis Backbone Report

## Summary
Introduced Redis as an optional realtime/event backbone for WeenTime communication and AI event preparation. Redis remains infrastructure only: pub/sub, fanout, ephemeral event transport, and short-lived future cache/correlation support. PostgreSQL and backend services remain authoritative for users, attendance, HR requests, approvals, balances, and audit history.

No Redis-backed business authority, n8n, LangGraph, ChromaDB, frontend changes, or autonomous workflows were added.

## Files Changed
- `.env.example`
- `docker-compose.redis.yml`
- `ai-service/config.py`
- `ai-service/requirements.txt`
- `ai-service/app/api/health_v2.py`
- `ai-service/app/events/__init__.py`
- `ai-service/app/events/event_models.py`
- `ai-service/app/events/publisher.py`
- `ai-service/tests/test_redis_event_publisher.py`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/config/RedisRealtimeConfig.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RedisRealtimeEnvelope.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RedisRealtimeEventPublisher.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RedisRealtimeSubscriber.java`
- `weentime-backend/services/communication-service/src/main/resources/application-redis.yml`

## Redis Architecture

### Backend communication-service
Communication-service already had a local websocket dispatcher and conditional Redis publisher/subscriber. P6-01 hardens that existing seam:

- Local mode remains default when `communication.redis.enabled=false`.
- Redis mode publishes a versioned realtime envelope to the configured pub/sub topic.
- Redis subscriber fans received events back into local websocket destinations.
- If Redis publish fails, the publisher falls back to local websocket dispatch for the current instance.
- Malformed Redis subscriber payloads are logged by byte count and exception class, not raw message payload.

### AI service
AI service now has a lightweight optional event publisher package:

- `RealtimeEventEnvelope`: versioned event envelope for future AI generated events.
- `RedisEventPublisher`: publishes sanitized events to Redis when enabled.
- `NoopEventPublisher`: safe default when Redis is disabled or unavailable.
- `/health/deep` includes `redis_events` status.

The AI event publisher is intentionally not wired to autonomous workflows. It is infrastructure preparation only.

## Channels And Events Added

### Communication-service Redis envelope event types
The backend envelope normalizes websocket event types into Redis event types:

- `communication.message.created`
- `communication.message.updated`
- `communication.message.deleted`
- `communication.typing.started`
- `communication.typing.stopped`
- `communication.read.updated`
- `notifications.created` for unread notification updates
- fallback prefix: `communication.<type>`

### AI service channel
- `ai.events.generated`

The AI event channel is configured through `REDIS_AI_EVENTS_CHANNEL`, defaulting to `ai.events.generated`.

## Optional Fallback Behavior

### Backend
- Redis disabled: uses existing local websocket dispatcher.
- Redis enabled and publish fails: logs safe metadata and dispatches locally.
- Redis listener error: logs exception class only and continues recovery.

### AI
- `REDIS_ENABLED=false`: uses no-op publisher.
- Redis SDK unavailable: uses no-op publisher.
- Redis server unavailable: publish returns `fallback=redis_unavailable`; business flow does not crash.
- No JWT/API keys/secrets are logged or written to Redis by the new publisher.

## Configuration Added

### Root `.env.example`

```env
REDIS_ENABLED=false
REDIS_URL=redis://localhost:6379
REDIS_AI_EVENTS_CHANNEL=ai.events.generated
REDIS_DEFAULT_TTL_SECONDS=300
```

### AI settings
- `redis_enabled`
- `redis_url`
- `redis_ai_events_channel`
- `redis_default_ttl_seconds`

### Communication-service profile
Added `application-redis.yml`:

```yaml
spring.data.redis.url: ${REDIS_URL:redis://localhost:6379}
communication.redis.enabled: ${REDIS_ENABLED:false}
communication.redis.topic: ${REDIS_COMMUNICATION_TOPIC:communication.realtime}
```

### Local Redis compose helper
Added `docker-compose.redis.yml` for optional local Redis:

```powershell
docker compose -f docker-compose.redis.yml up -d
```

## Communication-Service Integration
- `RedisRealtimeEnvelope` now includes `eventId`, `eventType`, `version`, `tenantId`, `actorUserId`, `occurredAt`, `sourceService`, and `traceId` alongside scope/target/event.
- `RedisRealtimeEventPublisher` now maps websocket types to event backbone names and performs local fallback on Redis publish failure.
- `RedisRealtimeSubscriber` no longer logs raw malformed Redis payloads.
- `RedisRealtimeConfig` now has recovery interval and safe error handler logging.

## AI Integration
- Added `app/events` package with event envelope and publisher abstractions.
- Added Redis dependency to AI requirements so Redis can be used when explicitly enabled.
- Added Redis event status to `/health/deep` without requiring Redis to be online.

## Tests Added/Updated
Added `ai-service/tests/test_redis_event_publisher.py` covering:

- Redis disabled mode uses no-op publisher.
- Redis publish creates a valid event envelope.
- Redis unavailable returns fallback without crashing.
- No permanent business state is written to Redis; test fake client only sees pub/sub publish.
- Redis status reports safe no-op mode when disabled.
- `/health/deep` includes Redis event status.

## Validation Results

### Backend communication-service
Command:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\weentime-backend\services\communication-service
.\mvnw.cmd clean compile -DskipTests
```

Result: `BUILD SUCCESS`.

### AI import
Command:

```powershell
cd C:\Users\DELL\Documents\GitHub\weentime_project\ai-service
python -c "import main; print('ok')"
```

Result: `ok`.

### Focused AI tests
Command:

```powershell
python -m pytest tests/test_redis_event_publisher.py tests/test_braintrust_real_integration.py -v
```

Result: `12 passed`, with existing warnings from `voice/stt.py` `audioop` deprecation and Redis dependency deprecation warnings.

### Full AI suite
Command:

```powershell
python -m pytest tests -v
```

Result: `356 passed`, `14 failed`, `6 warnings`.

Failures are outside P6 Redis/event files and were not fixed in this task to avoid mixing unrelated confirmation/voice/slot-filling work into the Redis commit. Failed tests:

- `tests/test_confirmation_error_handling.py::test_missing_confirmation_returns_controlled_envelope_not_http_404`
- `tests/test_confirmation_error_handling.py::test_duplicate_confirmation_returns_already_treated_message`
- `tests/test_confirmation_error_handling.py::test_confirm_backend_404_returns_clean_response_payload`
- `tests/test_request_correlation.py::test_chat_v2_preserves_x_request_id`
- `tests/test_request_correlation.py::test_voice_v2_preserves_x_request_id`
- `tests/test_slot_filling_flows.py::test_authorization_followup_date_time_continues_pending_flow`
- `tests/test_slot_filling_flows.py::test_authorization_complete_followup_returns_confirmation`
- `tests/test_slot_filling_flows.py::test_leave_followup_ghodwa_continues_pending_flow`
- `tests/test_slot_filling_flows.py::test_leave_direct_sick_leave_only_asks_missing_reason`
- `tests/test_slot_filling_flows.py::test_nn_does_not_trigger_generic_chat_during_pending_leave_flow`
- `tests/test_voice_contract.py::test_voice_v2_returns_transcript_and_text_aliases`
- `tests/test_voice_contract.py::test_voice_v2_invalid_audio_returns_controlled_envelope`
- `tests/test_voice_contract.py::test_voice_v2_preserves_confirmation_metadata`
- `tests/test_voice_contract.py::test_voice_v2_returns_audio_url_aliases_when_tts_generates_audio`

Observed root categories:
- Legacy compatibility `Claims` object in `copilot_engine` lacks `verified` for slot-filling tests.
- `/v2/voice` tests are receiving `401 Unauthorized` before mocked processor response.
- Confirmation/request correlation failures are in existing chat/confirm behavior.

## Remaining Limitations
- Redis Streams are not implemented yet; this task uses pub/sub/fanout preparation only.
- Redis is not used for distributed websocket session ownership yet.
- AI events are prepared but not emitted by copilot workflows yet.
- No n8n bridge was added.
- No frontend websocket changes were made.
- No permanent audit/event sourcing was moved to Redis.

## Exact Files Staged
Pending staging at report creation time:

- `.env.example`
- `docker-compose.redis.yml`
- `ai-service/config.py`
- `ai-service/requirements.txt`
- `ai-service/app/api/health_v2.py`
- `ai-service/app/events/__init__.py`
- `ai-service/app/events/event_models.py`
- `ai-service/app/events/publisher.py`
- `ai-service/tests/test_redis_event_publisher.py`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/config/RedisRealtimeConfig.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RedisRealtimeEnvelope.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RedisRealtimeEventPublisher.java`
- `weentime-backend/services/communication-service/src/main/java/com/weentime/communication/service/RedisRealtimeSubscriber.java`
- `weentime-backend/services/communication-service/src/main/resources/application-redis.yml`
- `P6_01_REDIS_BACKBONE_REPORT.md`

## Commit Hash
Pending commit at report creation time. Final commit hash is reported in the task completion message.
