package com.weentime.communication.dto;

import lombok.Builder;

import java.util.List;

@Builder
public record UnreadSummaryResponse(
        long totalUnread,
        List<UnreadChannelSummaryResponse> channels
) {
}
