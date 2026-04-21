package com.weentime.weentimeapp.exception;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiError {
    private boolean success;
    private String error;
    private String details;
    private String message;
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();
}
