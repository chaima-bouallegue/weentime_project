package com.weentime.communication.dto;

import java.util.Map;

public record InternalNotificationDispatchRequest(
        String title,
        String message,
        String type,
        String actionUrl,
        Long entrepriseId,
        Map<String, Object> metadata
) {
}
