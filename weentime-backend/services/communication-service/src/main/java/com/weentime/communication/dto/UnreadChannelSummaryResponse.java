package com.weentime.communication.dto;

import lombok.Builder;

import java.util.UUID;

@Builder
public record UnreadChannelSummaryResponse(
        UUID channelId,
        long unreadCount
) {
}
