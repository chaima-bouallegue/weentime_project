package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.service.RhSoldeService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/rh/soldes")
@RequiredArgsConstructor
public class RhSoldeController {

    private final RhSoldeService rhSoldeService;

    @GetMapping
    @PreAuthorize("hasAnyRole('RH', 'ADMIN')")
    public ResponseEntity<PageResponse<EmployeeSoldeResponse>> getGlobalSoldes(
            @RequestParam(required = false) Integer annee,
            @RequestParam(required = false) String query,
            Pageable pageable) {
        return ResponseEntity.ok(rhSoldeService.getGlobalSoldes(annee, query, pageable));
    }

    @PostMapping("/initialiser")
    @PreAuthorize("hasAnyRole('RH', 'ADMIN')")
    public ResponseEntity<Void> initialiserSoldes(@RequestBody InitialisationRequest request) {
        rhSoldeService.initialiserSoldes(request);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/reinitialiser-annuel")
    @PreAuthorize("hasAnyRole('RH', 'ADMIN')")
    public ResponseEntity<Void> reinitialiserAnnuel(@RequestBody ReinitialisationAnnuelleRequest request) {
        rhSoldeService.reinitialiserAnnuel(request);
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/{utilisateurId}/{typeCongeId}")
    @PreAuthorize("hasAnyRole('RH', 'ADMIN')")
    public ResponseEntity<Void> ajusterSolde(
            @PathVariable Long utilisateurId,
            @PathVariable Long typeCongeId,
            @RequestBody SoldeAjustementRequest request) {
        rhSoldeService.ajusterSolde(utilisateurId, typeCongeId, request);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{utilisateurId}/audit")
    @PreAuthorize("hasAnyRole('RH', 'ADMIN', 'MANAGER', 'EMPLOYEE')")
    public ResponseEntity<java.util.List<SoldeAuditLogDTO>> getAuditLogs(@PathVariable Long utilisateurId) {
        return ResponseEntity.ok(rhSoldeService.getAuditLogsByUtilisateur(utilisateurId));
    }

    @GetMapping("/utilisateur/{utilisateurId}")
    @PreAuthorize("hasAnyRole('RH', 'ADMIN', 'MANAGER', 'EMPLOYEE')")
    public ResponseEntity<java.util.List<com.weentime.weentimeapp.dto.SoldeDetailDTO>> getByUtilisateur(@PathVariable Long utilisateurId) {
        return ResponseEntity.ok(rhSoldeService.getByUtilisateur(utilisateurId));
    }
}
