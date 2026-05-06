package com.weentime.communication.dto;

import lombok.Builder;

import java.time.Instant;
import java.util.UUID;

@Builder
public record ReadReceiptEventResponse(
        UUID channelId,
        UUID messageId,
        Long userId,
        Instant readAt
) {
}
