package com.weentime.weentimeproject.exception;

import com.weentime.weentimeproject.dto.response.ApiResponse;
import jakarta.persistence.EntityNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    // ── 404 Entreprise Custom
    @ExceptionHandler(EntrepriseNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleEntrepriseNotFound(
            EntrepriseNotFoundException ex) {
        return error("ENTERPRISE_NOT_FOUND", ex.getMessage(), HttpStatus.NOT_FOUND);
    }

    // ── 409 SIRET Custom
    @ExceptionHandler(SiretAlreadyExistsException.class)
    public ResponseEntity<ApiResponse<Void>> handleSiretAlreadyExists(
            SiretAlreadyExistsException ex) {
        return error("SIRET_ALREADY_EXISTS", ex.getMessage(), HttpStatus.CONFLICT);
    }

    // ── 404
    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(
            EntityNotFoundException ex) {
        return error("RESOURCE_NOT_FOUND", ex.getMessage(), HttpStatus.NOT_FOUND);
    }

    // ── 403 Spring Security
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(
            AccessDeniedException ex) {
        return error("ACCESS_DENIED", ex.getMessage(), HttpStatus.FORBIDDEN);
    }

    // ── 400 Contrôle d'accès métier
    @ExceptionHandler(AccessControlValidationException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessControlValidation(
            AccessControlValidationException ex) {
        return error(ex.getCode(), ex.getMessage(), HttpStatus.BAD_REQUEST);
    }

    // ── 409 SIRET/State conflict
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalState(
            IllegalStateException ex) {
        if (ex.getMessage() != null
                && ex.getMessage().contains("authenticated user")) {
            return error("UNAUTHORIZED", ex.getMessage(), HttpStatus.UNAUTHORIZED);
        }
        return error("STATE_CONFLICT", ex.getMessage(), HttpStatus.CONFLICT);
    }

    // ── 400 argument invalide
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(
            IllegalArgumentException ex) {
        // SIRET déjà existant → 409
        if (ex.getMessage() != null
                && ex.getMessage().contains("SIRET déjà utilisé")) {
            return error("SIRET_ALREADY_EXISTS", ex.getMessage(), HttpStatus.CONFLICT);
        }
        return error("INVALID_ARGUMENT", ex.getMessage(), HttpStatus.BAD_REQUEST);
    }

    // ── 400 Bean Validation (@Valid)
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(
            MethodArgumentNotValidException ex,
            HttpServletRequest request) {

        Map<String, String> fields = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        org.springframework.validation.FieldError::getField,
                        fe -> fe.getDefaultMessage() != null
                                ? fe.getDefaultMessage()
                                : "Valeur invalide",
                        (a, b) -> a)); // garder la première erreur si doublon

        String summary = fields.entrySet().stream()
                .map(e -> e.getKey() + ": " + e.getValue())
                .collect(Collectors.joining(", "));

        log.warn("Validation error on {}: {}", request.getRequestURI(), summary);
        return error("VALIDATION_ERROR", summary, HttpStatus.BAD_REQUEST);
    }

    // ── 500 fallback
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleAll(
            Exception ex,
            HttpServletRequest request) {
        log.error("Unhandled exception on {}", request.getRequestURI(), ex);
        return error("INTERNAL_ERROR",
                "Une erreur interne est survenue.", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // ── Builder
    private ResponseEntity<ApiResponse<Void>> error(
            String code, String message, HttpStatusCode status) {
        return ResponseEntity.status(status)
                .body(ApiResponse.failure(code, message));
    }
}