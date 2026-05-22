package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.EntrepriseRequest;
import com.weentime.weentimeproject.dto.EntrepriseValidationDTO;
import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import com.weentime.weentimeproject.pagination.PageParams;
import com.weentime.weentimeproject.service.EntrepriseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/organisations/entreprises")
@RequiredArgsConstructor
public class EntrepriseController {
    private final EntrepriseService entrepriseService;

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseResponse> createEntreprise(
            @Valid @RequestBody EntrepriseRequest request) {
        return new ResponseEntity<>(entrepriseService.createEntreprise(request), HttpStatus.CREATED);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH', 'MANAGER')")
    public ResponseEntity<EntrepriseResponse> getEntrepriseById(
            @PathVariable Long id) {
        return ResponseEntity.ok(entrepriseService.getEntrepriseById(id));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RH', 'MANAGER')")
    public ResponseEntity<Page<EntrepriseResponse>> getAllEntreprises(
            @ModelAttribute PageParams params) {
        return ResponseEntity.ok(entrepriseService.getAllEntreprises(params.toPageable()));
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseResponse> updateEntreprise(
            @PathVariable Long id,
            @RequestBody EntrepriseRequest request) {
        return ResponseEntity.ok(entrepriseService.updateEntreprise(id, request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseResponse> replaceEntreprise(
            @PathVariable Long id,
            @RequestBody EntrepriseRequest request) {
        return updateEntreprise(id, request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteEntreprise(@PathVariable Long id) {
        entrepriseService.deleteEntreprise(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/validate-code/{code}")
    public ResponseEntity<EntrepriseValidationDTO> validateCode(@PathVariable String code) {
        EntrepriseValidationDTO response = entrepriseService.validateCode(code);
        if (response.isValid()) {
            return ResponseEntity.ok(response);
        }

        HttpStatus status = "ENTERPRISE_CLOSED".equals(response.getReason()) || "ENTERPRISE_FULL".equals(response.getReason())
                ? HttpStatus.CONFLICT
                : HttpStatus.NOT_FOUND;
        return ResponseEntity.status(status).body(response);
    }

    @PostMapping("/{id}/regenerate-code")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EntrepriseResponse> regenerateCode(@PathVariable Long id) {
        return ResponseEntity.ok(entrepriseService.regenerateInvitationCode(id));
    }

    @GetMapping("/by-code/{code}")
    public ResponseEntity<EntrepriseResponse> getByCode(@PathVariable String code) {
        try {
            return ResponseEntity.ok(entrepriseService.getByCode(code));
        } catch (jakarta.persistence.EntityNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }

}
