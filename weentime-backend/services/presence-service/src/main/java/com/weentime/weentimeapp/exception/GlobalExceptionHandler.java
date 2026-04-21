package com.weentime.weentimeapp.exception;

import com.weentime.weentimeapp.dto.response.ApiResponse;
import jakarta.persistence.EntityNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(EntityNotFoundException exception) {
        return build(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", exception.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException exception) {
        String details = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .findFirst()
                .orElse("Validation error");
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", details);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadRequest(IllegalArgumentException exception) {
        return build(HttpStatus.BAD_REQUEST, "BAD_REQUEST", exception.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalState(IllegalStateException exception) {
        String message = exception.getMessage() == null ? "Operation conflict" : exception.getMessage();
        if (message.contains("authenticated") || message.contains("JWT")) {
            return build(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", message);
        }
        if (message.contains("already open")) {
            return build(HttpStatus.CONFLICT, "ATTENDANCE_SESSION_ALREADY_OPEN", message);
        }
        if (message.contains("No open attendance session")) {
            return build(HttpStatus.CONFLICT, "ATTENDANCE_SESSION_NOT_OPEN", message);
        }
        if (message.contains("leave")) {
            return build(HttpStatus.CONFLICT, "ATTENDANCE_ON_LEAVE_FORBIDDEN", message);
        }
        return build(HttpStatus.CONFLICT, "STATE_CONFLICT", message);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneric(Exception exception) {
        log.error("Unhandled presence-service exception", exception);
        String details = exception.getMessage() == null ? "Unexpected server error" : exception.getMessage();
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", details);
    }

    private ResponseEntity<ApiResponse<Void>> build(HttpStatus status, String error, String details) {
        return ResponseEntity.status(status).body(ApiResponse.failure(error, details));
    }
}
