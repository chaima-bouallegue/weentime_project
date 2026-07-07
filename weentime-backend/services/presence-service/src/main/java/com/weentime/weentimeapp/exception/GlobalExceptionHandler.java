package com.weentime.weentimeapp.exception;

import com.weentime.weentimeapp.dto.response.ApiResponse;
import jakarta.persistence.EntityNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
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

    @ExceptionHandler(PresenceBusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handlePresenceBusiness(PresenceBusinessException exception) {
        return build(exception.getStatus(), exception.getCode(), exception.getMessage());
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
        if (message.contains("already checked in")) {
            return build(HttpStatus.CONFLICT, "ATTENDANCE_ALREADY_CHECKED_IN", message);
        }
        if (message.contains("No open attendance session")) {
            return build(HttpStatus.CONFLICT, "ATTENDANCE_SESSION_NOT_OPEN", message);
        }
        if (message.contains("already checked out")) {
            return build(HttpStatus.CONFLICT, "ATTENDANCE_ALREADY_CHECKED_OUT", message);
        }
        if (message.contains("leave")) {
            return build(HttpStatus.CONFLICT, "ATTENDANCE_ON_LEAVE_FORBIDDEN", message);
        }
        if (message.contains("holiday") || message.contains("jour ferie")) {
            return build(HttpStatus.CONFLICT, "ATTENDANCE_ON_HOLIDAY_FORBIDDEN", message);
        }
        return build(HttpStatus.CONFLICT, "STATE_CONFLICT", message);
    }

    @ExceptionHandler({AccessDeniedException.class, AuthorizationDeniedException.class})
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(RuntimeException exception) {
        return build(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Vous n'avez pas les droits pour effectuer cette operation.");
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
