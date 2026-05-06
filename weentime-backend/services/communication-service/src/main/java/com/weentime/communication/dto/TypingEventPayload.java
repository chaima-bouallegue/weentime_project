package com.weentime.communication.dto;

import lombok.Builder;

import java.util.UUID;

@Builder
public record TypingEventPayload(
        UUID channelId,
        Long userId,
        String fullName
) {
}
