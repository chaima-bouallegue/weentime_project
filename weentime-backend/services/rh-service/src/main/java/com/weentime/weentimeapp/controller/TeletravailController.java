package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.StatsManagerDTO;
import com.weentime.weentimeapp.dto.StatsRhDTO;
import com.weentime.weentimeapp.dto.TeletravailCreateDTO;
import com.weentime.weentimeapp.dto.TeletravailResponseDTO;
import com.weentime.weentimeapp.service.TeletravailService;
import jakarta.validation.Valid;
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
@RequestMapping({"/api/v1/rh/teletravail", "/api/v1/rh/teletravails"})
@RequiredArgsConstructor
public class TeletravailController {

    private final TeletravailService service;
    private final OrganisationServiceClient organisationClient;

    private String getUserEmail() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<TeletravailResponseDTO> create(@Valid @RequestBody TeletravailCreateDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(dto, getUserEmail()));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<List<TeletravailResponseDTO>> getAll() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && hasRole(authentication, "ROLE_RH")) {
            return ResponseEntity.ok(service.getHistoriqueGlobal());
        }
        if (authentication != null && hasRole(authentication, "ROLE_MANAGER")) {
            return ResponseEntity.ok(service.getDemandesEquipe(getUserEmail()));
        }
        return ResponseEntity.ok(service.getMesDemandes(getUserEmail()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<TeletravailResponseDTO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    @GetMapping("/mes-demandes")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<List<TeletravailResponseDTO>> getMesDemandes() {
        return ResponseEntity.ok(service.getMesDemandes(getUserEmail()));
    }

    @GetMapping("/quota")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<com.weentime.weentimeapp.dto.QuotaTeletravailDTO> getQuota() {
        return ResponseEntity.ok(service.getQuota(getUserEmail()));
    }

    @GetMapping("/quota/utilisateur/{id}")
    @PreAuthorize("hasAnyRole('MANAGER', 'RH')")
    public ResponseEntity<com.weentime.weentimeapp.dto.QuotaTeletravailDTO> getQuotaByCollaborateur(@PathVariable Long id) {
        return ResponseEntity.ok(service.getQuota(id, getUserEmail()));
    }

    @PutMapping("/{id}/annuler")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<TeletravailResponseDTO> annuler(@PathVariable Long id) {
        return ResponseEntity.ok(service.annuler(id, getUserEmail()));
    }

    @GetMapping("/demandes-equipe")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<List<TeletravailResponseDTO>> getDemandesEquipe() {
        return ResponseEntity.ok(service.getDemandesEquipe(getUserEmail()));
    }

    @GetMapping("/mes-decisions")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<List<TeletravailResponseDTO>> getMesDecisions() {
        return ResponseEntity.ok(service.getMesDecisions(getUserEmail()));
    }

    @GetMapping("/stats-manager")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<StatsManagerDTO> getStatsManager() {
        return ResponseEntity.ok(service.getStatsManager(getUserEmail()));
    }

    @PatchMapping("/{id}/valider-manager")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<TeletravailResponseDTO> validerManager(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body
    ) {
        Long managerId = organisationClient.getUtilisateurForAuth(getUserEmail()).getId();
        String commentaire = body != null ? body.get("commentaire") : null;
        return ResponseEntity.ok(service.validerManager(id, managerId, commentaire));
    }

    @PatchMapping("/{id}/rejeter-manager")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<TeletravailResponseDTO> rejeterManager(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body
    ) {
        Long managerId = organisationClient.getUtilisateurForAuth(getUserEmail()).getId();
        String commentaire = body == null ? null : body.get("commentaire");
        return ResponseEntity.ok(service.rejeterManager(id, managerId, commentaire));
    }

    @GetMapping("/en-attente-rh")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<List<TeletravailResponseDTO>> getEnAttenteRh() {
        return ResponseEntity.ok(service.getEnAttenteRh());
    }

    @GetMapping("/historique-global")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<List<TeletravailResponseDTO>> getHistoriqueGlobal() {
        return ResponseEntity.ok(service.getHistoriqueGlobal());
    }

    @GetMapping("/stats-rh")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<StatsRhDTO> getStatsRh() {
        return ResponseEntity.ok(service.getStatsRh());
    }

    @PatchMapping("/{id}/valider-rh")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<TeletravailResponseDTO> validerRH(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body
    ) {
        String commentaire = body != null ? body.get("commentaire") : null;
        return ResponseEntity.ok(service.validerRH(id, commentaire));
    }

    @PatchMapping("/{id}/rejeter-rh")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<TeletravailResponseDTO> rejeterRH(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body
    ) {
        String commentaire = body == null ? null : body.get("commentaire");
        return ResponseEntity.ok(service.rejeterRH(id, commentaire));
    }

    private boolean hasRole(Authentication authentication, String role) {
        return authentication.getAuthorities().stream().anyMatch(authority -> role.equals(authority.getAuthority()));
    }
}
