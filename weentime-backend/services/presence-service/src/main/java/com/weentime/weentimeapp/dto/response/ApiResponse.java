package com.weentime.weentimeapp.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {
    private boolean success;
    private T data;
    private String error;
    private String details;
    private String message;
    private String timestamp;

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .success(true)
                .data(data)
                .error(null)
                .details(null)
                .message(null)
                .timestamp(Instant.now().toString())
                .build();
    }

    public static <T> ApiResponse<T> failure(String error, String details) {
        return ApiResponse.<T>builder()
                .success(false)
                .data(null)
                .error(error)
                .details(details)
                .message(details)
                .timestamp(Instant.now().toString())
                .build();
    }
}
