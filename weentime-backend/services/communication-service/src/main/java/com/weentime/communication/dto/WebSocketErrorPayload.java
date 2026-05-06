package com.weentime.communication.dto;

import lombok.Builder;

import java.util.Map;

@Builder
public record WebSocketErrorPayload(
        String code,
        String message,
        Map<String, Object> details
) {
}
