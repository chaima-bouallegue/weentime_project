package com.weentime.communication.dto;

import lombok.Builder;

import java.util.Map;

@Builder
public record ApiError(
        String code,
        String message,
        Map<String, Object> details
) {
}
