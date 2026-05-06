package com.weentime.communication.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.config.CommunicationProperties;
import com.weentime.communication.dto.WebSocketEventResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "communication.redis", name = "enabled", havingValue = "true")
public class RedisRealtimeEventPublisher implements RealtimeEventPublisher {

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final CommunicationProperties communicationProperties;

    @Override
    public void publishChannelEvent(UUID channelId, WebSocketEventResponse event) {
        publish(new RedisRealtimeEnvelope("channel", channelId.toString(), event));
    }

    @Override
    public void publishUserEvent(Long userId, WebSocketEventResponse event) {
        publish(new RedisRealtimeEnvelope("user", String.valueOf(userId), event));
    }

    private void publish(RedisRealtimeEnvelope envelope) {
        try {
            stringRedisTemplate.convertAndSend(
                    communicationProperties.getRedis().getTopic(),
                    objectMapper.writeValueAsString(envelope)
            );
        } catch (Exception exception) {
            log.warn("Unable to publish realtime event to Redis: {}", exception.getMessage());
        }
    }
}
