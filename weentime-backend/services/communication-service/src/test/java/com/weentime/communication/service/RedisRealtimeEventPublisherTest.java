package com.weentime.communication.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.config.CommunicationProperties;
import com.weentime.communication.dto.NotificationCategory;
import com.weentime.communication.dto.NotificationEventTypes;
import com.weentime.communication.dto.WebSocketEventResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RedisRealtimeEventPublisherTest {

    @Mock
    private StringRedisTemplate stringRedisTemplate;

    @Mock
    private LocalRealtimeDispatcher localRealtimeDispatcher;

    private ObjectMapper objectMapper;
    private CommunicationProperties communicationProperties;
    private RedisRealtimeEventPublisher publisher;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper().findAndRegisterModules();
        communicationProperties = new CommunicationProperties();
        communicationProperties.getRedis().setTopic("test.communication.realtime");
        publisher = new RedisRealtimeEventPublisher(
                stringRedisTemplate,
                objectMapper,
                communicationProperties,
                localRealtimeDispatcher
        );
    }

    @Test
    void publishesTenantScopedNotificationEnvelope() throws Exception {
        UUID eventId = UUID.randomUUID();
        WebSocketEventResponse event = WebSocketEventResponse.builder()
                .eventId(eventId)
                .type(NotificationEventTypes.NOTIFICATIONS_CREATED)
                .entrepriseId(77L)
                .actorId(9L)
                .data(Map.of(
                        "eventType", NotificationEventTypes.COMMUNICATION_MENTION_CREATED,
                        "category", NotificationCategory.ACTION_REQUIRED.name()
                ))
                .createdAt(Instant.parse("2026-05-14T10:15:30Z"))
                .build();
        when(stringRedisTemplate.convertAndSend(eq("test.communication.realtime"), anyString())).thenReturn(1L);

        publisher.publishUserEvent(42L, event);

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(stringRedisTemplate).convertAndSend(eq("test.communication.realtime"), payload.capture());
        JsonNode envelope = objectMapper.readTree(payload.getValue());
        assertThat(envelope.path("eventId").asText()).isEqualTo(eventId.toString());
        assertThat(envelope.path("eventType").asText()).isEqualTo(NotificationEventTypes.NOTIFICATIONS_CREATED);
        assertThat(envelope.path("version").asInt()).isEqualTo(1);
        assertThat(envelope.path("tenantId").asLong()).isEqualTo(77L);
        assertThat(envelope.path("actorUserId").asLong()).isEqualTo(9L);
        assertThat(envelope.path("scope").asText()).isEqualTo("user");
        assertThat(envelope.path("target").asText()).isEqualTo("42");
        assertThat(envelope.path("event").path("type").asText()).isEqualTo(NotificationEventTypes.NOTIFICATIONS_CREATED);
    }

    @Test
    void fallsBackToLocalUserDispatchWhenRedisPublishFails() {
        WebSocketEventResponse event = WebSocketEventResponse.builder()
                .eventId(UUID.randomUUID())
                .type(NotificationEventTypes.NOTIFICATIONS_CREATED)
                .entrepriseId(77L)
                .actorId(9L)
                .data(Map.of("category", NotificationCategory.INFO.name()))
                .createdAt(Instant.now())
                .build();
        doThrow(new RuntimeException("redis unavailable"))
                .when(stringRedisTemplate)
                .convertAndSend(eq("test.communication.realtime"), anyString());

        publisher.publishUserEvent(42L, event);

        verify(localRealtimeDispatcher).dispatchUserEvent(42L, event);
    }

    @Test
    void mapsLegacyMessageEventsToCommunicationNamespace() throws Exception {
        WebSocketEventResponse event = WebSocketEventResponse.builder()
                .eventId(UUID.randomUUID())
                .type("message.created")
                .entrepriseId(77L)
                .actorId(9L)
                .data(Map.of("body", "Bonjour"))
                .createdAt(Instant.now())
                .build();
        when(stringRedisTemplate.convertAndSend(eq("test.communication.realtime"), anyString())).thenReturn(1L);

        publisher.publishChannelEvent(UUID.randomUUID(), event);

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(stringRedisTemplate).convertAndSend(eq("test.communication.realtime"), payload.capture());
        JsonNode envelope = objectMapper.readTree(payload.getValue());
        assertThat(envelope.path("eventType").asText()).isEqualTo(NotificationEventTypes.COMMUNICATION_MESSAGE_CREATED);
        assertThat(envelope.path("scope").asText()).isEqualTo("channel");
    }
}
