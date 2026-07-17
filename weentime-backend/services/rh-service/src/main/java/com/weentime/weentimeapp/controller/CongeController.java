package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.CongeDTO;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.CongeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/rh/conges")
@RequiredArgsConstructor
public class CongeController {

    private final CongeService service;
    private final OrganisationServiceClient organisationServiceClient;

    @PostMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<CongeDTO> create(@RequestBody CongeDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(dto));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<List<CongeDTO>> getAll() {
        return ResponseEntity.ok(resolveListForCurrentRole());
    }

    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<List<CongeDTO>> getMine() {
        return ResponseEntity.ok(service.getByUtilisateur(SecurityUtils.getCurrentUserId()));
    }

    @GetMapping("/manager")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<List<CongeDTO>> getManagerConges() {
        return ResponseEntity.ok(getManagerScopedConges());
    }

    @GetMapping("/rh/pending")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<List<CongeDTO>> getRhPendingConges() {
        return ResponseEntity.ok(service.getPendingForEntreprise(SecurityUtils.getCurrentEntrepriseId()));
    }

    @GetMapping("/pending")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<List<CongeDTO>> getPendingConges() {
        return ResponseEntity.ok(service.getPendingForEntreprise(SecurityUtils.getCurrentEntrepriseId()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<CongeDTO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    @GetMapping("/utilisateur/{id}")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<List<CongeDTO>> getByUser(@PathVariable Long id) {
        return ResponseEntity.ok(service.getByUtilisateur(id));
    }

    @GetMapping("/equipe")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<List<CongeDTO>> getByEquipe(@RequestParam List<Long> ids) {
        return ResponseEntity.ok(service.getByUtilisateurs(ids));
    }

    @PatchMapping({"/{id}/valider", "/{id}/validate-manager"})
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<CongeDTO> validateByManager(@PathVariable Long id) {
        return ResponseEntity.ok(service.validateByManager(id, SecurityUtils.getCurrentUserId()));
    }

    @PatchMapping({"/{id}/valider-rh", "/{id}/validate-rh"})
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<CongeDTO> validateByRH(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body
    ) {
        return ResponseEntity.ok(service.validateByRH(id, SecurityUtils.getCurrentUserId()));
    }

    @PatchMapping({"/{id}/refuser", "/{id}/refuser-rh", "/{id}/reject"})
    @PreAuthorize("hasAnyRole('MANAGER','RH')")
    public ResponseEntity<CongeDTO> reject(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body,
            @RequestParam(required = false) String commentaire
    ) {
        String resolvedComment = commentaire;
        if ((resolvedComment == null || resolvedComment.isBlank()) && body != null) {
            resolvedComment = body.get("commentaire");
        }
        return ResponseEntity.ok(service.reject(id, SecurityUtils.getCurrentUserId(), resolvedComment));
    }

    @PatchMapping("/{id}/cancel")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<CongeDTO> cancel(@PathVariable Long id) {
        return ResponseEntity.ok(service.cancel(id));
    }

    private List<CongeDTO> resolveListForCurrentRole() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return List.of();
        }
        if (hasRole(authentication, "ROLE_RH")) {
            return service.getAll();
        }
        if (hasRole(authentication, "ROLE_MANAGER")) {
            return getManagerScopedConges();
        }
        return service.getByUtilisateur(SecurityUtils.getCurrentUserId());
    }

    private List<CongeDTO> getManagerScopedConges() {
        Long managerId = SecurityUtils.getCurrentUserId();
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();

        List<Long> teamMemberIds = organisationServiceClient.findUsersByEntreprise(entrepriseId).stream()
                .filter(user -> managerId.equals(user.getManagerId()))
                .map(UserResponse::getId)
                .toList();

        if (teamMemberIds.isEmpty()) {
            return List.of();
        }

        return service.getByUtilisateurs(teamMemberIds);
    }

    private boolean hasRole(Authentication authentication, String role) {
        return authentication.getAuthorities().stream().anyMatch(authority -> role.equals(authority.getAuthority()));
    }
}
