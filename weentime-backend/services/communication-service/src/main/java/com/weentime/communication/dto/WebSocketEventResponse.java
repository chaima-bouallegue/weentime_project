package com.weentime.communication.dto;

import lombok.Builder;

import java.time.Instant;
import java.util.UUID;

@Builder
public record WebSocketEventResponse(
        UUID eventId,
        String type,
        Long entrepriseId,
        UUID channelId,
        Long actorId,
        Object data,
        Instant createdAt
) {
}
