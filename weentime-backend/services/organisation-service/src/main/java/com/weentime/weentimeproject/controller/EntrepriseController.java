package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.EntrepriseAccessControlDto;
import com.weentime.weentimeproject.dto.EntrepriseAccessControlHistoryDto;
import com.weentime.weentimeproject.dto.EntrepriseStatsDto;
import com.weentime.weentimeproject.dto.EntrepriseValidationDTO;
import com.weentime.weentimeproject.dto.request.EntrepriseRequest;
import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import com.weentime.weentimeproject.pagination.PageParams;
import com.weentime.weentimeproject.service.EntrepriseAccessControlService;
import com.weentime.weentimeproject.service.EntrepriseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping({
        "/api/v1/organisations/entreprises",
        "/api/v1/entreprises"
})
@RequiredArgsConstructor
public class EntrepriseController {

    private final EntrepriseService entrepriseService;
    private final EntrepriseAccessControlService accessControlService;

    // ──────────────────────────────────────────────────────────
    // CRUD
    // ──────────────────────────────────────────────────────────

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseResponse> create(
            @Valid @RequestBody EntrepriseRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(entrepriseService.createEntreprise(request));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH', 'MANAGER')")
    public ResponseEntity<EntrepriseResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(entrepriseService.getEntrepriseById(id));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody EntrepriseRequest request) {
        return ResponseEntity.ok(entrepriseService.updateEntreprise(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        entrepriseService.deleteEntreprise(id);
        return ResponseEntity.noContent().build();
    }

    // ──────────────────────────────────────────────────────────
    // Liste filtrée + paginée
    // ──────────────────────────────────────────────────────────

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RH', 'MANAGER')")
    public ResponseEntity<Page<EntrepriseResponse>> getAll(
            @RequestParam(defaultValue = "ALL") String status,
            @RequestParam(required = false) String search,
            @ModelAttribute PageParams params) {
        return ResponseEntity.ok(
                entrepriseService.getAllEntreprises(status, search, params.toPageable()));
    }

    // ──────────────────────────────────────────────────────────
    // Stats agrégées
    // ──────────────────────────────────────────────────────────

    @GetMapping("/stats")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseStatsDto> getStats() {
        return ResponseEntity.ok(entrepriseService.getStats());
    }

    // ──────────────────────────────────────────────────────────
    // Changement de statut unitaire
    // ──────────────────────────────────────────────────────────

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseResponse> changeStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        String status = body.get("status");
        if (status == null || status.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(entrepriseService.changeStatus(id, status));
    }

    // ──────────────────────────────────────────────────────────
    // Batch
    // ──────────────────────────────────────────────────────────

    @DeleteMapping("/batch")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteBatch(
            @RequestBody Map<String, List<Long>> body) {
        entrepriseService.deleteBatch(body.get("ids"));
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/batch/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> changeStatusBatch(
            @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Long> ids = (List<Long>) body.get("ids");
        String status = (String) body.get("status");
        entrepriseService.changeStatusBatch(ids, status);
        return ResponseEntity.noContent().build();
    }

    // ──────────────────────────────────────────────────────────
    // Code invitation
    // ──────────────────────────────────────────────────────────

    @GetMapping("/validate-code/{code}")
    public ResponseEntity<EntrepriseValidationDTO> validateCode(
            @PathVariable String code) {
        EntrepriseValidationDTO result = entrepriseService.validateCode(code);
        if (result.isValid())
            return ResponseEntity.ok(result);
        HttpStatus httpStatus = switch (result.getReason()) {
            case "ENTERPRISE_CLOSED", "ENTERPRISE_FULL" -> HttpStatus.CONFLICT;
            default -> HttpStatus.NOT_FOUND;
        };
        return ResponseEntity.status(httpStatus).body(result);
    }

    @PostMapping("/{id}/regenerate-code")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseResponse> regenerateCode(@PathVariable Long id) {
        return ResponseEntity.ok(entrepriseService.regenerateInvitationCode(id));
    }

    @GetMapping("/by-code/{code}")
    public ResponseEntity<EntrepriseResponse> getByCode(@PathVariable String code) {
        return ResponseEntity.ok(entrepriseService.getByCode(code));
    }
    // ──────────────────────────────────────────────────────────
    // Access Control
    // ──────────────────────────────────────────────────────────

    @GetMapping("/{id}/access-control")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseAccessControlDto> getAccessControl(
            @PathVariable Long id) {
        return ResponseEntity.ok(accessControlService.getAccessControl(id));
    }

    @PutMapping("/{id}/access-control")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseAccessControlDto> updateAccessControl(
            @PathVariable Long id,
            @Valid @RequestBody EntrepriseAccessControlDto request) {

        String updatedBy = SecurityContextHolder.getContext()
                .getAuthentication().getName();
        return ResponseEntity.ok(
                accessControlService.updateAccessControl(id, request, updatedBy));
    }

    @GetMapping("/{id}/access-control/history")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<EntrepriseAccessControlHistoryDto>> getAccessControlHistory(
            @PathVariable Long id) {
        return ResponseEntity.ok(accessControlService.getHistory(id));
    }
}