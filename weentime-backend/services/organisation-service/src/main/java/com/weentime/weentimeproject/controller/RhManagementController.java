package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.RhOwnerAssignEntrepriseRequest;
import com.weentime.weentimeproject.dto.request.RhOwnerCreateRequest;
import com.weentime.weentimeproject.dto.request.RhOwnerUpdateRequest;
import com.weentime.weentimeproject.dto.response.ApiResponse;
import com.weentime.weentimeproject.dto.response.RhOwnerResponse;
import com.weentime.weentimeproject.service.UtilisateurService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping({"/api/v1/organisations/rh", "/api/v1/organisations/rh-owners"})
@RequiredArgsConstructor
public class RhManagementController {

    private final UtilisateurService utilisateurService;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<RhOwnerResponse>>> getAllRh() {
        return ResponseEntity.ok(ApiResponse.success(utilisateurService.getAllRh(), "Succes"));
    }

    @GetMapping("/entreprise/{entrepriseId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<RhOwnerResponse>>> getRhByEntreprise(@PathVariable Long entrepriseId) {
        return ResponseEntity.ok(ApiResponse.success(utilisateurService.getRhByEntreprise(entrepriseId), "Succes"));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<RhOwnerResponse>> createRhOwner(@Valid @RequestBody RhOwnerCreateRequest request) {
        RhOwnerResponse response = utilisateurService.createRhOwner(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response, "RH cree avec succes"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<RhOwnerResponse>> updateRhOwner(
            @PathVariable Long id,
            @Valid @RequestBody RhOwnerUpdateRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(utilisateurService.updateRhOwner(id, request), "RH mis a jour avec succes"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteRhOwner(@PathVariable Long id) {
        utilisateurService.deleteRhOwner(id);
        return ResponseEntity.ok(ApiResponse.success(null, "RH supprime avec succes"));
    }

    @PutMapping("/{id}/assign-entreprise")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<RhOwnerResponse>> assignEntreprise(
            @PathVariable Long id,
            @Valid @RequestBody RhOwnerAssignEntrepriseRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                utilisateurService.assignRhOwnerEntreprise(id, request.getEntrepriseId()),
                "Entreprise assignee avec succes"
        ));
    }

    @PatchMapping("/{id}/toggle-statut")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<RhOwnerResponse>> toggleStatut(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(utilisateurService.toggleRhStatut(id), "Statut modifie avec succes"));
    }
}
