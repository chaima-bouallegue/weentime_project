package com.weentime.communication.dto;

import lombok.Builder;

@Builder
public record SenderSummary(
        Long id,
        String fullName,
        String role,
        String avatarUrl
) {
}
