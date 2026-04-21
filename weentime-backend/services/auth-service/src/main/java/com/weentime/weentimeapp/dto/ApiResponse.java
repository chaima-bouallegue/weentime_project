package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

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
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    public static <T> ApiResponse<T> success(T data, String details) {
        return ApiResponse.<T>builder()
                .success(true)
                .data(data)
                .error(null)
                .details(details)
                .message(details)
                .build();
    }

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .success(true)
                .data(data)
                .error(null)
                .details(null)
                .message(null)
                .build();
    }

    public static <T> ApiResponse<T> failure(String error, String details) {
        return ApiResponse.<T>builder()
                .success(false)
                .data(null)
                .error(error)
                .details(details)
                .message(details)
                .build();
    }

    public static <T> ApiResponse<T> error(String error, String details) {
        return failure(error, details);
    }
}
