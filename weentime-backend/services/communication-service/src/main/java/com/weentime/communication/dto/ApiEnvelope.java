package com.weentime.communication.dto;

import lombok.Builder;

import java.util.List;

@Builder
public record ApiEnvelope<T>(
        boolean success,
        T data,
        List<String> warnings,
        ApiError error
) {
    public static <T> ApiEnvelope<T> success(T data) {
        return ApiEnvelope.<T>builder()
                .success(true)
                .data(data)
                .warnings(List.of())
                .error(null)
                .build();
    }

    public static <T> ApiEnvelope<T> failure(ApiError error) {
        return ApiEnvelope.<T>builder()
                .success(false)
                .data(null)
                .warnings(List.of())
                .error(error)
                .build();
    }
}
