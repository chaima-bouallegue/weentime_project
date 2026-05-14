package com.weentime.communication.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.config.CommunicationProperties;
import com.weentime.communication.dto.WebSocketEventResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "communication.redis", name = "enabled", havingValue = "true")
public class RedisRealtimeEventPublisher implements RealtimeEventPublisher {

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final CommunicationProperties communicationProperties;
    private final LocalRealtimeDispatcher localRealtimeDispatcher;

    @Override
    public void publishChannelEvent(UUID channelId, WebSocketEventResponse event) {
        publish(envelope("channel", channelId.toString(), event));
    }

    @Override
    public void publishUserEvent(Long userId, WebSocketEventResponse event) {
        publish(envelope("user", String.valueOf(userId), event));
    }

    private void publish(RedisRealtimeEnvelope envelope) {
        try {
            stringRedisTemplate.convertAndSend(
                    communicationProperties.getRedis().getTopic(),
                    objectMapper.writeValueAsString(envelope)
            );
        } catch (Exception exception) {
            log.warn(
                    "Unable to publish realtime event to Redis. eventType={}, scope={}, target={}, error={}",
                    envelope.eventType(),
                    envelope.scope(),
                    envelope.target(),
                    exception.getClass().getSimpleName()
            );
            dispatchLocalFallback(envelope);
        }
    }

    private RedisRealtimeEnvelope envelope(String scope, String target, WebSocketEventResponse event) {
        return new RedisRealtimeEnvelope(
                event.eventId(),
                redisEventType(event),
                1,
                event.entrepriseId(),
                event.actorId(),
                scope,
                target,
                event.createdAt() == null ? Instant.now() : event.createdAt(),
                "communication-service",
                null,
                event
        );
    }

    private void dispatchLocalFallback(RedisRealtimeEnvelope envelope) {
        try {
            if ("channel".equalsIgnoreCase(envelope.scope())) {
                localRealtimeDispatcher.dispatchChannelEvent(UUID.fromString(envelope.target()), envelope.event());
                return;
            }
            if ("user".equalsIgnoreCase(envelope.scope())) {
                localRealtimeDispatcher.dispatchUserEvent(Long.parseLong(envelope.target()), envelope.event());
            }
        } catch (Exception fallbackException) {
            log.warn(
                    "Unable to dispatch local realtime fallback. eventType={}, scope={}, target={}, error={}",
                    envelope.eventType(),
                    envelope.scope(),
                    envelope.target(),
                    fallbackException.getClass().getSimpleName()
            );
        }
    }

    private String redisEventType(WebSocketEventResponse event) {
        String type = event.type() == null ? "generated" : event.type();
        if (type.startsWith("message.")) {
            return "communication." + type;
        }
        if (type.startsWith("typing.")) {
            return "communication." + type;
        }
        if (type.startsWith("read.")) {
            return "communication." + type;
        }
        if (type.startsWith("unread.")) {
            return "notifications.created";
        }
        return "communication." + type;
    }
}
