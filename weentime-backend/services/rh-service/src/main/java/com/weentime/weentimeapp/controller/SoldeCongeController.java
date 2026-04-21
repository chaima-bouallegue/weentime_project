package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.service.SoldeCongeService;
import com.weentime.weentimeapp.dto.SoldeCongeDTO;
import com.weentime.weentimeapp.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/rh/solde-conges")
@RequiredArgsConstructor
public class SoldeCongeController {

    private final SoldeCongeService service;

    @GetMapping("/me/all")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<List<SoldeCongeDTO>> getMySoldes(@RequestParam(required = false) Integer annee) {
        return ResponseEntity.ok(service.getByUtilisateur(SecurityUtils.getCurrentUserId()));
    }

    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<SoldeCongeDTO> getMySolde(
            @RequestParam Long typeCongeId,
            @RequestParam(required = false) Integer annee) {
        return ResponseEntity.ok(service.getByUtilisateurAndType(SecurityUtils.getCurrentUserId(), typeCongeId));
    }

    @GetMapping("/users/{utilisateurId}")
    @PreAuthorize("hasAnyRole('RH','MANAGER')")
    public ResponseEntity<List<SoldeCongeDTO>> getByUserAlias(
            @PathVariable Long utilisateurId,
            @RequestParam(required = false) Integer annee) {
        return ResponseEntity.ok(service.getByUtilisateur(utilisateurId));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE','RH')")
    public ResponseEntity<SoldeCongeDTO> getSolde(
            @RequestParam Long utilisateurId,
            @RequestParam Long typeCongeId) {

        return ResponseEntity.ok(
                service.getByUtilisateurAndType(utilisateurId, typeCongeId)
        );
    }

    @GetMapping("/utilisateur/{utilisateurId}")
    @PreAuthorize("hasAnyRole('EMPLOYEE','RH')")
    public ResponseEntity<List<com.weentime.weentimeapp.dto.SoldeCongeDTO>> getByUtilisateur(@PathVariable Long utilisateurId) {
        return ResponseEntity.ok(service.getByUtilisateur(utilisateurId));
    }

    @PostMapping
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<SoldeCongeDTO> updateSolde(
            @RequestBody SoldeCongeDTO dto) {

        return ResponseEntity.ok(service.updateSolde(dto.getUtilisateurId(), dto.getTypeCongeId(), dto.getJoursRestants()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<SoldeCongeDTO> updateSoldeById(
            @PathVariable Long id,
            @RequestBody SoldeCongeDTO dto) {
        return ResponseEntity.ok(service.updateSolde(dto.getUtilisateurId(), dto.getTypeCongeId(), dto.getJoursRestants()));
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<SoldeCongeDTO> patchSoldeById(
            @PathVariable Long id,
            @RequestBody SoldeCongeDTO dto) {
        return ResponseEntity.ok(service.updateSolde(dto.getUtilisateurId(), dto.getTypeCongeId(), dto.getJoursRestants()));
    }

    @GetMapping("/total")
    @PreAuthorize("hasAnyRole('EMPLOYEE','RH')")
    public ResponseEntity<Double> getTotalSolde(@RequestParam Long utilisateurId) {
        return ResponseEntity.ok(service.getTotalJoursRestants(utilisateurId));
    }

    @PostMapping("/bulk-initialization")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<Void> bulkInitialization(
            @RequestBody java.util.List<Long> utilisateurIds,
            @RequestParam(defaultValue = "false") boolean overwrite) {
        service.initialiserSoldes(utilisateurIds, overwrite);
        return ResponseEntity.ok().build();
    }
}
