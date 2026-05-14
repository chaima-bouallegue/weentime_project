package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.RegisterRequest;
import com.weentime.weentimeproject.dto.request.UtilisateurRequest;
import com.weentime.weentimeproject.dto.request.ValidationRequest;
import com.weentime.weentimeproject.dto.response.UtilisateurResponse;
import com.weentime.weentimeproject.pagination.PageParams;
import com.weentime.weentimeproject.service.UtilisateurService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/organisations/users")
@RequiredArgsConstructor
public class UtilisateurController {

    private final UtilisateurService utilisateurService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UtilisateurResponse> createUtilisateur(
            @Valid @RequestBody UtilisateurRequest request) {
        return new ResponseEntity<>(
                utilisateurService.createUtilisateur(request),
                HttpStatus.CREATED
        );
    }

    @PostMapping("/register")
    public ResponseEntity<UtilisateurResponse> registerUtilisateur(
            @Valid @RequestBody RegisterRequest request) {
        return new ResponseEntity<>(
                utilisateurService.registerUtilisateur(request),
                HttpStatus.CREATED
        );
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH', 'MANAGER') or authentication.name == @utilisateurService.getEmailById(#id)")
    public ResponseEntity<UtilisateurResponse> getUtilisateurById(
            @PathVariable Long id) {
        return ResponseEntity.ok(utilisateurService.getUtilisateurById(id));
    }

    @GetMapping("/entreprise/{entrepriseId}")
    public ResponseEntity<java.util.List<UtilisateurResponse>> getUtilisateursByEntreprise(
            @PathVariable Long entrepriseId) {
        return ResponseEntity.ok(utilisateurService.getUtilisateursByEntreprise(entrepriseId));
    }

    @GetMapping("/entreprise/{entrepriseId}/ids")
    public ResponseEntity<java.util.List<Long>> getUtilisateurIdsByEntreprise(
            @PathVariable Long entrepriseId) {
        return ResponseEntity.ok(utilisateurService.getUtilisateurIdsByEntreprise(entrepriseId));
    }

    @GetMapping("/entreprise/{entrepriseId}/role/{role}/ids")
    public ResponseEntity<java.util.List<Long>> getUtilisateurIdsByEntrepriseAndRole(
            @PathVariable Long entrepriseId,
            @PathVariable String role) {
        return ResponseEntity.ok(utilisateurService.getUtilisateurIdsByEntrepriseAndRole(entrepriseId, role));
    }

    @GetMapping("/by-email")
    @PreAuthorize("hasAnyRole('RH', 'MANAGER', 'ADMIN')")
    public ResponseEntity<UtilisateurResponse> getUtilisateurByEmail(
            @RequestParam String email) {
        return ResponseEntity.ok(utilisateurService.getUtilisateurByEmail(email));
    }

    @GetMapping("/auth/by-email")
    public ResponseEntity<com.weentime.weentimeproject.dto.response.UtilisateurAuthResponse> getUtilisateurForAuth(
            @RequestParam String email) {
        return ResponseEntity.ok(utilisateurService.getUtilisateurForAuth(email));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RH', 'MANAGER', 'EMPLOYEE')")
    public ResponseEntity<Page<UtilisateurResponse>> getAllUtilisateurs(
            @Valid PageParams params,
            @RequestParam(required = false) Long entrepriseId) {
        return ResponseEntity.ok(
                utilisateurService.getAllUtilisateurs(params.toPageable(), entrepriseId)
        );
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UtilisateurResponse> updateUtilisateur(
            @PathVariable Long id,
            @Valid @RequestBody UtilisateurRequest request) {
        return ResponseEntity.ok(
                utilisateurService.updateUtilisateur(id, request)
        );
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UtilisateurResponse> replaceUtilisateur(
            @PathVariable Long id,
            @Valid @RequestBody UtilisateurRequest request) {
        return updateUtilisateur(id, request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<Void> deleteUtilisateur(@PathVariable Long id) {
        utilisateurService.deleteUtilisateur(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/pending")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<java.util.List<UtilisateurResponse>> getPendingUsers() {
        return ResponseEntity.ok(utilisateurService.getUtilisateursParStatut(com.weentime.weentimeproject.enums.StatutUtilisateurEnum.PENDING));
    }

    @PatchMapping("/{id}/valider")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UtilisateurResponse> validerUtilisateur(
            @PathVariable Long id,
            @RequestBody(required = false) ValidationRequest request) {
        if (request == null) {
            request = new ValidationRequest();
        }
        return ResponseEntity.ok(utilisateurService.validerUtilisateur(id, request));
    }

    @PatchMapping("/{id}/rejeter")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UtilisateurResponse> rejeterUtilisateur(@PathVariable Long id) {
        return ResponseEntity.ok(utilisateurService.rejeterUtilisateur(id));
    }

    @PutMapping("/{id}/toggle-status")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UtilisateurResponse> toggleUtilisateurStatus(@PathVariable Long id) {
        return ResponseEntity.ok(utilisateurService.toggleUtilisateurStatut(id));
    }

    @PutMapping("/{id}/manager")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UtilisateurResponse> assignManager(
            @PathVariable Long id,
            @RequestParam(required = false) Long managerId) {
        return ResponseEntity.ok(utilisateurService.assignManager(id, managerId));
    }

    @PostMapping("/2fa/update")
    public ResponseEntity<Void> update2faSettings(@RequestParam String email,
                                                  @RequestParam boolean enabled,
                                                  @RequestParam(required = false) String type,
                                                  @RequestParam(required = false) String secret) {
        utilisateurService.update2faSettings(email, enabled, type, secret);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/2fa/backup-codes")
    public ResponseEntity<Void> updateBackupCodes(@RequestParam String email,
                                                  @RequestBody java.util.List<String> codes) {
        utilisateurService.updateBackupCodes(email, codes);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/2fa/failure")
    public ResponseEntity<java.util.Map<String, Object>> register2faFailure(@RequestParam String email) {
        return ResponseEntity.ok(utilisateurService.register2faFailure(email));
    }

    @PostMapping("/2fa/reset")
    public ResponseEntity<Void> reset2faAttempts(@RequestParam String email) {
        utilisateurService.reset2faAttempts(email);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/equipe/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH', 'MANAGER')")
    public ResponseEntity<java.util.List<UtilisateurResponse>> getUtilisateursByEquipe(
            @PathVariable Long id) {
        return ResponseEntity.ok(utilisateurService.getUtilisateursByEquipe(id));
    }

}
