package com.weentime.communication.exception;

import com.weentime.communication.dto.ApiEnvelope;
import com.weentime.communication.dto.ApiError;
import com.weentime.communication.security.CommunicationUserPrincipal;
import jakarta.persistence.EntityNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private static final Pattern CHANNEL_PATH_PATTERN = Pattern.compile("/channels/([^/]+)");

    @ExceptionHandler(CommunicationException.class)
    public ResponseEntity<ApiEnvelope<Void>> handleCommunicationException(
            CommunicationException exception,
            HttpServletRequest request
    ) {
        log.warn("Communication request failed: context={}, code={}, message={}",
                requestContext(request), exception.getCode(), exception.getMessage());
        return ResponseEntity.status(exception.getStatus()).body(ApiEnvelope.failure(ApiError.builder()
                .code(exception.getCode())
                .message(exception.getMessage())
                .details(exception.getDetails())
                .build()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiEnvelope<Void>> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        Map<String, Object> details = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            details.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        log.warn("Communication validation failed: context={}, details={}", requestContext(request), details);
        return ResponseEntity.badRequest().body(ApiEnvelope.failure(ApiError.builder()
                .code("COMM_VALIDATION_ERROR")
                .message("The request payload is invalid.")
                .details(details)
                .build()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiEnvelope<Void>> handleAccessDenied(
            AccessDeniedException exception,
            HttpServletRequest request
    ) {
        log.warn("Communication access denied: context={}, message={}", requestContext(request), exception.getMessage());
        return failure(HttpStatus.FORBIDDEN, "COMM_FORBIDDEN", "You do not have access to this resource.", Map.of());
    }

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ApiEnvelope<Void>> handleEntityNotFound(
            EntityNotFoundException exception,
            HttpServletRequest request
    ) {
        log.warn("Communication resource not found: context={}, message={}", requestContext(request), exception.getMessage());
        return failure(HttpStatus.NOT_FOUND, "COMM_RESOURCE_NOT_FOUND", "The requested resource was not found.", Map.of());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiEnvelope<Void>> handleIllegalArgument(
            IllegalArgumentException exception,
            HttpServletRequest request
    ) {
        log.warn("Communication bad request: context={}, message={}", requestContext(request), exception.getMessage());
        return failure(HttpStatus.BAD_REQUEST, "COMM_BAD_REQUEST", "The request is invalid.", Map.of());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiEnvelope<Void>> handleTypeMismatch(
            MethodArgumentTypeMismatchException exception,
            HttpServletRequest request
    ) {
        Map<String, Object> details = Map.of("parameter", exception.getName());
        log.warn("Communication parameter mismatch: context={}, parameter={}, value={}",
                requestContext(request), exception.getName(), exception.getValue());
        return failure(HttpStatus.BAD_REQUEST, "COMM_PARAMETER_INVALID", "One request parameter is invalid.", details);
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiEnvelope<Void>> handleDataAccess(
            DataAccessException exception,
            HttpServletRequest request
    ) {
        log.error("Communication data access failure: context={}, message={}",
                requestContext(request), exception.getMessage(), exception);
        return failure(HttpStatus.INTERNAL_SERVER_ERROR, "COMM_DATA_ACCESS_ERROR",
                "Communication data is temporarily unavailable.", Map.of());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiEnvelope<Void>> handleUnexpected(Exception exception, HttpServletRequest request) {
        log.error("Unexpected communication failure: context={}, message={}",
                requestContext(request), exception.getMessage(), exception);
        return failure(HttpStatus.INTERNAL_SERVER_ERROR, "COMM_INTERNAL_ERROR",
                "An unexpected communication error occurred.", Map.of());
    }

    private ResponseEntity<ApiEnvelope<Void>> failure(
            HttpStatus status,
            String code,
            String message,
            Map<String, Object> details
    ) {
        return ResponseEntity.status(status).body(ApiEnvelope.failure(ApiError.builder()
                .code(code)
                .message(message)
                .details(details)
                .build()));
    }

    private Map<String, Object> requestContext(HttpServletRequest request) {
        Map<String, Object> context = new LinkedHashMap<>();
        String path = request == null ? "" : request.getRequestURI();
        context.put("path", path);
        String channelId = extractChannelId(path);
        if (channelId != null) {
            context.put("channelId", channelId);
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof CommunicationUserPrincipal principal) {
            context.put("userId", principal.userId());
            context.put("entrepriseId", principal.entrepriseId());
        }
        return context;
    }

    private String extractChannelId(String path) {
        if (path == null || path.isBlank()) {
            return null;
        }
        Matcher matcher = CHANNEL_PATH_PATTERN.matcher(path);
        return matcher.find() ? matcher.group(1) : null;
    }
}
