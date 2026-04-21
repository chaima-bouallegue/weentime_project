package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.service.AbsenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/rh/absences")
@RequiredArgsConstructor
@Tag(name = "Absences", description = "Gestion des absences employés")
public class AbsenceController {

    private final AbsenceService absenceService;

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEE — Déclarer une absence
    // ─────────────────────────────────────────────────────────────────────────

    @PostMapping
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Déclarer une absence",
               description = "L'employé déclare une absence. Le justificatif au format Base64 est assigné directement.")
    @ApiResponse(responseCode = "201", description = "Absence créée avec succès")
    @ApiResponse(responseCode = "409", description = "Chevauchement avec une absence existante")
    public ResponseEntity<AbsenceResponse> declarer(@Valid @RequestBody AbsenceRequest request) {
        String email = currentUserEmail();
        AbsenceResponse response = absenceService.declarer(request, email);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEE — Mes absences (paginées + filtrées)
    // ─────────────────────────────────────────────────────────────────────────

    @GetMapping("/mes-absences")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Lister mes absences",
               description = "Retourne la liste paginée des absences de l'employé connecté.")
    public ResponseEntity<PageResponse<AbsenceResponse>> mesAbsences(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false)    String statut,
            @RequestParam(required = false)    String type
    ) {
        String email = currentUserEmail();
        return ResponseEntity.ok(absenceService.mesAbsences(email, page, size, statut, type));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RH — Toutes les absences de l'entreprise
    // ─────────────────────────────────────────────────────────────────────────

    @GetMapping("/entreprise")
    @PreAuthorize("hasRole('RH') or hasRole('MANAGER')")
    @Operation(summary = "Toutes les absences de l'entreprise",
               description = "Vue RH ou Manager — toutes les absences de l'entreprise du demandeur, paginées.")
    public ResponseEntity<PageResponse<AbsenceResponse>> absencesEntreprise(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false)    String statut
    ) {
        String email = currentUserEmail();
        return ResponseEntity.ok(absenceService.absencesEntreprise(email, page, size, statut));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RH — Valider une absence
    // ─────────────────────────────────────────────────────────────────────────

    @PatchMapping("/{id}/valider")
    @PreAuthorize("hasRole('RH')")
    @Operation(summary = "Approuver une absence",
               description = "Le RH approuve une absence EN_ATTENTE_RH.")
    @ApiResponse(responseCode = "200", description = "Absence approuvée")
    public ResponseEntity<AbsenceResponse> valider(@PathVariable Long id) {
        String email = currentUserEmail();
        return ResponseEntity.ok(absenceService.valider(id, email));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RH — Rejeter une absence
    // ─────────────────────────────────────────────────────────────────────────

    @PatchMapping("/{id}/rejeter")
    @PreAuthorize("hasRole('RH')")
    @Operation(summary = "Rejeter une absence",
               description = "Le RH rejette une absence EN_ATTENTE_RH avec un motif obligatoire.")
    @ApiResponse(responseCode = "200", description = "Absence rejetée")
    public ResponseEntity<AbsenceResponse> rejeter(
            @PathVariable Long id,
            @Valid @RequestBody RejectionRequest rejectionRequest
    ) {
        String email = currentUserEmail();
        return ResponseEntity.ok(absenceService.rejeter(id, email, rejectionRequest.getMotifRefus()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEE — Annuler une absence (soft delete)
    // ─────────────────────────────────────────────────────────────────────────

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Annuler une absence",
               description = "L'employé annule sa propre absence uniquement si elle est EN_ATTENTE_RH.")
    @ApiResponse(responseCode = "204", description = "Absence annulée")
    public ResponseEntity<Void> annuler(@PathVariable Long id) {
        String email = currentUserEmail();
        absenceService.annuler(id, email);
        return ResponseEntity.noContent().build();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers privés
    // ─────────────────────────────────────────────────────────────────────────

    private String currentUserEmail() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}