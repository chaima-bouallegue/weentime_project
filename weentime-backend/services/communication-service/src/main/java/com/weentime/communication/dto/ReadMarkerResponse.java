package com.weentime.communication.dto;

import lombok.Builder;

import java.time.Instant;
import java.util.UUID;

@Builder
public record ReadMarkerResponse(
        UUID channelId,
        UUID messageId,
        Instant readAt
) {
}
