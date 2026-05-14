package com.weentime.communication.dto;

import lombok.Builder;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Builder
public record RealtimeNotificationPayload(
        String notificationEventId,
        Long recipientId,
        Long entrepriseId,
        String eventType,
        String category,
        String title,
        String message,
        String actionUrl,
        UUID channelId,
        UUID messageId,
        Map<String, Object> metadata,
        Instant createdAt
) {
}
