package com.weentime.communication.dto;

import lombok.Builder;

@Builder
public record ReactionSummary(
        String emoji,
        long count,
        boolean reactedByMe
) {
}
