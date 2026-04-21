package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.AutorisationDTO;
import com.weentime.weentimeapp.dto.CongeDTO;
import com.weentime.weentimeapp.dto.DemandeDocumentResponse;
import com.weentime.weentimeapp.dto.SoldeCongeDTO;
import com.weentime.weentimeapp.dto.TeletravailCreateDTO;
import com.weentime.weentimeapp.dto.TeletravailResponseDTO;
import com.weentime.weentimeapp.dto.UtilisateurAuthResponse;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.AutorisationService;
import com.weentime.weentimeapp.service.CongeService;
import com.weentime.weentimeapp.service.DocumentService;
import com.weentime.weentimeapp.service.SoldeCongeService;
import com.weentime.weentimeapp.service.TeletravailService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class EmployeeCompatibilityController {

    private final SoldeCongeService soldeCongeService;
    private final CongeService congeService;
    private final AutorisationService autorisationService;
    private final TeletravailService teletravailService;
    private final DocumentService documentService;
    private final OrganisationServiceClient organisationServiceClient;

    @GetMapping("/leave-balances")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<List<SoldeCongeDTO>> getLeaveBalances(@RequestParam(required = false) Long userId) {
        Long resolvedUserId = SecurityUtils.getCurrentUserId();
        if (userId != null && hasElevatedRole()) {
            resolvedUserId = userId;
        }
        return ResponseEntity.ok(soldeCongeService.getByUtilisateur(resolvedUserId));
    }

    @PostMapping("/conges")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<CongeDTO> createConge(@RequestBody CongeDTO request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(congeService.create(request));
    }

    @PostMapping("/autorisations")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<AutorisationDTO> createAutorisation(@RequestBody AutorisationDTO request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(autorisationService.create(request, currentUserEmail()));
    }

    @PostMapping("/teletravail")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<TeletravailResponseDTO> createTeletravail(@RequestBody TeletravailCreateDTO request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(teletravailService.create(request, currentUserEmail()));
    }

    @GetMapping("/documents")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<List<DemandeDocumentResponse>> getMyDocuments() {
        return ResponseEntity.ok(documentService.getMesDemandes(resolveCurrentUser().getId()));
    }

    private String currentUserEmail() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private UtilisateurAuthResponse resolveCurrentUser() {
        UtilisateurAuthResponse user = organisationServiceClient.getUtilisateurForAuth(currentUserEmail());
        if (user == null || user.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Contexte utilisateur introuvable.");
        }
        return user;
    }

    private boolean hasElevatedRole() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_MANAGER".equals(authority.getAuthority()) || "ROLE_RH".equals(authority.getAuthority()));
    }
}
