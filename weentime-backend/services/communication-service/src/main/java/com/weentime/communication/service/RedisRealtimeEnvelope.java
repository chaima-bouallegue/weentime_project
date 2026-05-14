package com.weentime.communication.service;

import com.weentime.communication.dto.WebSocketEventResponse;

import java.time.Instant;
import java.util.UUID;

public record RedisRealtimeEnvelope(
        UUID eventId,
        String eventType,
        int version,
        Long tenantId,
        Long actorUserId,
        String scope,
        String target,
        Instant occurredAt,
        String sourceService,
        String traceId,
        WebSocketEventResponse event
) {
}
