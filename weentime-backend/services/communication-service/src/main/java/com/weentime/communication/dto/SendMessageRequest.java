package com.weentime.communication.dto;

import java.util.Map;
import java.util.UUID;
import java.util.List;

public record SendMessageRequest(
        String clientMessageId,
        String type,
        String body,
        String richBody,
        UUID parentMessageId,
        List<Long> mentions,
        Map<String, Object> metadata
) {
}
