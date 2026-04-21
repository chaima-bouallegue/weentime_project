package com.weentime.weentimeapp.exception;

import com.weentime.weentimeapp.dto.ApiResponse;
import feign.FeignException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationExceptions(MethodArgumentNotValidException exception) {
        String details = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", details);
    }

    @ExceptionHandler(FeignException.class)
    public ResponseEntity<ApiResponse<Void>> handleFeignStatusException(FeignException exception) {
        HttpStatus status = HttpStatus.resolve(exception.status());
        return build(
                status != null ? status : HttpStatus.INTERNAL_SERVER_ERROR,
                "INTEGRATION_ERROR",
                exception.getMessage()
        );
    }

    @ExceptionHandler(UsernameNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleUserNotFound(UsernameNotFoundException exception) {
        String details = exception.getMessage() != null ? exception.getMessage() : "User not found";
        return build(HttpStatus.UNAUTHORIZED, "USER_NOT_FOUND", details);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(IllegalArgumentException exception) {
        return build(HttpStatus.BAD_REQUEST, "BAD_REQUEST", exception.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalState(IllegalStateException exception) {
        String message = exception.getMessage() == null ? "Authentication state error" : exception.getMessage();
        if (message.contains("authenticated user") || message.contains("authentifie")) {
            return build(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_ERROR", message);
        }
        return build(HttpStatus.CONFLICT, "STATE_CONFLICT", message);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleAllExceptions(Exception exception) {
        String details = exception.getMessage() != null ? exception.getMessage() : "Unexpected server error";
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", details);
    }

    private ResponseEntity<ApiResponse<Void>> build(HttpStatus status, String error, String details) {
        return ResponseEntity.status(status).body(ApiResponse.failure(error, details));
    }
}
