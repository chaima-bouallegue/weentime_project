package com.weentime.communication.dto;

import lombok.Builder;

import java.time.Instant;

@Builder
public record MessageThreadSummary(
        int replyCount,
        Instant lastReplyAt
) {
}
