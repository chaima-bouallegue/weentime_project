package com.weentime.communication.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.dto.WebSocketEventResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "communication.redis", name = "enabled", havingValue = "true")
public class RedisRealtimeSubscriber implements MessageListener {

    private final ObjectMapper objectMapper;
    private final LocalRealtimeDispatcher localRealtimeDispatcher;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            RedisRealtimeEnvelope envelope = objectMapper.readValue(
                    message.getBody(),
                    RedisRealtimeEnvelope.class
            );
            WebSocketEventResponse event = envelope.event();
            if ("channel".equalsIgnoreCase(envelope.scope())) {
                localRealtimeDispatcher.dispatchChannelEvent(UUID.fromString(envelope.target()), event);
                return;
            }
            if ("user".equalsIgnoreCase(envelope.scope())) {
                localRealtimeDispatcher.dispatchUserEvent(Long.parseLong(envelope.target()), event);
            }
        } catch (Exception exception) {
            log.warn(
                    "Ignoring malformed Redis realtime event payload. bytes={}, error={}",
                    message.getBody() == null ? 0 : message.getBody().length,
                    exception.getClass().getSimpleName()
            );
        }
    }
}
