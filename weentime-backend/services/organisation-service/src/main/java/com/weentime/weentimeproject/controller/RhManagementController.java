package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.response.ApiResponse;
import com.weentime.weentimeproject.dto.response.RhOwnerResponse;
import com.weentime.weentimeproject.service.UtilisateurService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/organisations/rh")
@RequiredArgsConstructor
public class RhManagementController {

    private final UtilisateurService utilisateurService;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<RhOwnerResponse>>> getAllRh() {
        return ResponseEntity.ok(ApiResponse.success(utilisateurService.getAllRh(), "Succès"));
    }

    @GetMapping("/entreprise/{entrepriseId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<RhOwnerResponse>>> getRhByEntreprise(@PathVariable Long entrepriseId) {
        return ResponseEntity.ok(ApiResponse.success(utilisateurService.getRhByEntreprise(entrepriseId), "Succès"));
    }

    @PatchMapping("/{id}/toggle-statut")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<RhOwnerResponse>> toggleStatut(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(utilisateurService.toggleRhStatut(id), "Statut modifié avec succès"));
    }
}
