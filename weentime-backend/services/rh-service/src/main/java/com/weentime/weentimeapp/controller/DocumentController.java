package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.service.AiService;
import com.weentime.weentimeapp.service.DocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/v1/documents")
@RequiredArgsConstructor
@SuppressWarnings("null")
public class DocumentController {

    private final DocumentService service;
    private final OrganisationServiceClient organisationServiceClient;
    private final AiService aiService;

    @PostMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE', 'MANAGER', 'RH')")
    public ResponseEntity<DemandeDocumentResponse> create(@RequestBody CreateDocumentRequest request) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createDemande(request, email));
    }

    @GetMapping("/mes-demandes")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<List<DemandeDocumentResponse>> getMesDemandes() {
        return ResponseEntity.ok(service.getMesDemandes(getUserId()));
    }

    @PutMapping("/{id}/annuler")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<DemandeDocumentResponse> annuler(@PathVariable Long id) {
        return ResponseEntity.ok(service.annulerDemande(id, getUserId()));
    }

    @GetMapping("/{id}/telecharger")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<Resource> telecharger(@PathVariable Long id) {
        Resource resource = service.telechargerDocument(id, getUserId());
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }

    @PutMapping("/{id}/statut")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> updateStatut(
            @PathVariable Long id,
            @RequestBody UpdateStatutRequest request) {
        return ResponseEntity.ok(service.updateStatut(id, request));
    }

    @GetMapping("/rh/demandes")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<List<DemandeDocumentResponse>> getDemandesEntreprise() {
        return ResponseEntity.ok(service.getDemandesEntreprise(getRhEntrepriseId()));
    }

    @GetMapping("/rh/stats")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<StatsDocumentsDTO> getStats() {
        return ResponseEntity.ok(service.getStats(getRhEntrepriseId()));
    }

    @PutMapping("/{id}/passer-en-cours")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> passerEnCours(@PathVariable Long id) {
        return ResponseEntity.ok(service.passerEnCours(id, getUserId()));
    }

    @PutMapping("/{id}/valider")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> valider(
            @PathVariable Long id,
            @RequestBody ValiderDocumentRequest request) {
        return ResponseEntity.ok(service.valider(id, request));
    }

    @PostMapping(path = "/{id}/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> uploadDocument(
            @PathVariable Long id,
            @RequestPart("file") MultipartFile file) {
        return ResponseEntity.ok(service.uploadDocumentRh(id, file, getRhEntrepriseId()));
    }

    @PutMapping("/{id}/refuser")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> refuser(
            @PathVariable Long id,
            @RequestBody java.util.Map<String, String> body) {
        return ResponseEntity.ok(service.refuser(id, body.get("commentaireRH")));
    }

    @GetMapping("/{id}/file")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<Resource> viewDocument(@PathVariable Long id) {
        Resource resource = service.telechargerDocumentRh(id, getRhEntrepriseId());
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }

    @PostMapping("/rh/generate-ai")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<AIGenerationResult> generateAIDocument(@RequestBody AIGenerationRequest request) {
        String prompt = String.format(
            "Tu es un assistant RH professionnel. Génère une %s officielle pour l'employé suivant :\n" +
            "- Nom complet : %s %s\n" +
            "- Poste : %s\n" +
            "- Département : %s\n" +
            "- Entreprise : WeenTime\n" +
            "%s\n" +
            "Le document doit être formel, professionnel, en français, avec la date du jour, " +
            "les formules légales appropriées et la mention \"Pour faire valoir ce que de droit\". " +
            "Retourne uniquement le contenu du document sans balises markdown.",
            request.getLabel(), request.getEmployePrenom(), request.getEmployeNom(),
            request.getEmployePoste(), request.getEmployeDepartement(),
            request.getMoisConcerne() != null ? "- Mois concerné : " + request.getMoisConcerne() : ""
        );

        String contenu = aiService.generateDocument(prompt);
        return ResponseEntity.ok(AIGenerationResult.builder()
            .contenu(contenu)
            .type(request.getType())
            .employeNom(request.getEmployePrenom() + " " + request.getEmployeNom())
            .dateGeneration(java.time.LocalDateTime.now().toString())
            .build());
    }

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(DocumentController.class);


    private Long getRhEntrepriseId() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        log.info("Resolving RH enterprise context.");
        try {
            UtilisateurAuthResponse user = organisationServiceClient.getUtilisateurForAuth(email);
            if (user == null || user.getEntrepriseId() == null) {
                log.error("No enterprise found for current RH account.");
                throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Aucune entreprise assignée à ce compte RH");
            }
            log.info("RH enterprise context resolved.");
            return user.getEntrepriseId();
        } catch (Exception e) {
            log.error("Error calling organisation-service: {}", e.getMessage());
            throw e;
        }
    }

    private Long getUserId() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        log.info("Resolving current user id.");
        try {
            UtilisateurAuthResponse user = organisationServiceClient.getUtilisateurForAuth(email);
            if (user == null || user.getId() == null) {
                log.error("Authenticated user was not found in organisation-service.");
                throw new RuntimeException("Utilisateur non trouvé pour l'email: " + email);
            }
            log.info("Current user id resolved.");
            return user.getId();
        } catch (Exception e) {
            log.error("Error calling organisation-service: {}", e.getMessage());
            throw new RuntimeException("Erreur lors de la récupération de l'ID utilisateur: " + e.getMessage(), e);
        }
    }
}
