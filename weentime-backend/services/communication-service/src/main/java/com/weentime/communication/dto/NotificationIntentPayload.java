package com.weentime.communication.dto;

import java.util.Map;
import java.util.UUID;

public record NotificationIntentPayload(
        String notificationEventId,
        Long recipientId,
        String eventType,
        String groupKey,
        UUID channelId,
        UUID messageId,
        String title,
        String message,
        String actionUrl,
        Map<String, Object> metadata
) {
}
