package com.weentime.communication.dto;

public record UpdateMessageRequest(
        String body,
        String richBody,
        String reason
) {
}
