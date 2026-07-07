package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.AIAdvancedGenerationRequest;
import com.weentime.weentimeapp.dto.AIGenerationRequest;
import com.weentime.weentimeapp.dto.AIGenerationResult;
import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.CreateDocumentRequest;
import com.weentime.weentimeapp.dto.DemandeDocumentResponse;
import com.weentime.weentimeapp.dto.DocumentAuditLogResponse;
import com.weentime.weentimeapp.dto.DocumentPreviewRequest;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.dto.StatsDocumentsDTO;
import com.weentime.weentimeapp.dto.UpdateStatutRequest;
import com.weentime.weentimeapp.dto.UtilisateurAuthResponse;
import com.weentime.weentimeapp.dto.ValiderDocumentRequest;
import com.weentime.weentimeapp.dto.SignerDocumentRequest;
import com.weentime.weentimeapp.service.AiService;
import com.weentime.weentimeapp.service.DocumentService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import com.weentime.weentimeapp.repository.DocumentRepository;
import com.weentime.weentimeapp.entity.Document;
import com.weentime.weentimeapp.service.DocumentGeneratorService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/documents")
@RequiredArgsConstructor
@SuppressWarnings("null")
public class DocumentController {

    private static final Logger log = LoggerFactory.getLogger(DocumentController.class);

    private final DocumentService service;
    private final OrganisationServiceClient organisationServiceClient;
    private final AiService aiService;
    private final DocumentRepository documentRepository;
    private final DocumentGeneratorService documentGeneratorService;
    private final com.weentime.weentimeapp.service.TemplateResolver templateResolver;

    @PostMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE', 'MANAGER', 'RH')")
    public ResponseEntity<DemandeDocumentResponse> create(@RequestBody CreateDocumentRequest request) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createDemande(request, email));
    }

    @GetMapping("/mes-demandes")
    @PreAuthorize("hasAnyRole('EMPLOYEE', 'MANAGER', 'RH')")
    public ResponseEntity<List<DemandeDocumentResponse>> getMesDemandes() {
        return ResponseEntity.ok(service.getMesDemandes(getUserId()));
    }

    @PutMapping("/{id}/annuler")
    @PreAuthorize("hasAnyRole('EMPLOYEE', 'MANAGER', 'RH')")
    public ResponseEntity<DemandeDocumentResponse> annuler(@PathVariable Long id) {
        return ResponseEntity.ok(service.annulerDemande(id, getUserId()));
    }

    @GetMapping("/{id}/telecharger")
    @PreAuthorize("hasAnyRole('EMPLOYEE', 'MANAGER', 'RH')")
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
        return ResponseEntity.ok(service.updateStatut(id, request, getUserId()));
    }

    @GetMapping("/{id}/audit")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<List<DocumentAuditLogResponse>> getDocumentAudit(@PathVariable Long id) {
        return ResponseEntity.ok(service.getDocumentAudit(id, getRhEntrepriseId()));
    }

    @PostMapping("/{id}/preview")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<byte[]> previewPdf(
            @PathVariable Long id,
            @RequestBody DocumentPreviewRequest request) {
        byte[] pdf = service.previewPdf(id, request != null ? request.getContenu() : null, getRhEntrepriseId());
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"preview-" + id + ".pdf\"")
                .body(pdf);
    }

    @GetMapping("/rh/demandes")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<?> getDemandesEntreprise(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        List<DemandeDocumentResponse> demandes = service.getDemandesEntreprise(getRhEntrepriseId());
        if (page == null && size == null) {
            return ResponseEntity.ok(demandes);
        }
        return ResponseEntity.ok(ApiResponse.success(toPage(demandes, page, size)));
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
        return ResponseEntity.ok(service.valider(id, request, getUserId()));
    }

    @PutMapping("/{id}/approuver")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> approuver(
            @PathVariable Long id,
            @RequestBody ValiderDocumentRequest request) {
        return ResponseEntity.ok(service.approuver(id, request, getUserId()));
    }

    @PutMapping("/{id}/signer")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> signer(
            @PathVariable Long id,
            @RequestBody SignerDocumentRequest request) {
        return ResponseEntity.ok(service.signer(id, request, getUserId()));
    }

    @PutMapping("/{id}/envoyer")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> envoyer(
            @PathVariable Long id) {
        return ResponseEntity.ok(service.envoyer(id, getUserId()));
    }

    @PostMapping(path = "/{id}/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> uploadDocument(
            @PathVariable Long id,
            @RequestPart("file") MultipartFile file) {
        return ResponseEntity.ok(service.uploadDocumentRh(id, file, getRhEntrepriseId(), getUserId()));
    }

    @PutMapping("/{id}/refuser")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<DemandeDocumentResponse> refuser(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(service.refuser(id, body.get("commentaireRH"), getUserId()));
    }

    @GetMapping("/{id}/file")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<Resource> viewDocument(@PathVariable Long id) {
        Resource resource = service.telechargerDocumentRh(id, getRhEntrepriseId(), getUserId());
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }

    @PostMapping("/rh/generate-ai")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<AIGenerationResult> generateAIDocument(@RequestBody AIGenerationRequest request) {
        // Try document-aware generation using TypeDocument configuration
        if (request.getDocumentId() != null) {
            Document document = documentRepository.findByIdWithTypeDocument(request.getDocumentId()).orElse(null);
            if (document != null && document.getTypeDocument() != null) {
                log.info("Génération via DocumentGeneratorService: mode={}, type={}",
                    document.getTypeDocument().getModeGeneration(), document.getTypeDocument().getCode());
                DocumentGeneratorService.GeneratedDocument generated =
                    documentGeneratorService.generateContentOnly(document, document.getTypeDocument());
                service.logAiGeneration(request.getDocumentId(), getUserId(),
                    "Génération — " + document.getTypeDocument().getLibelle()
                    + " (mode=" + document.getTypeDocument().getModeGeneration() + ")");
                return ResponseEntity.ok(AIGenerationResult.builder()
                    .contenu(generated.content())
                    .tokensUsed(generated.tokensUsed())
                    .modelUsed(generated.modelUsed())
                    .type(request.getType())
                    .employeNom(request.getEmployePrenom() + " " + request.getEmployeNom())
                    .dateGeneration(java.time.LocalDateTime.now().toString())
                    .build());
            }
        }

        // Fallback: legacy AI-only generation (no TypeDocument found)
        String prompt = String.format(
                "Tu es un assistant RH professionnel. Genere une %s officielle pour l'employe suivant :\n" +
                        "- Nom complet : %s %s\n" +
                        "- Poste : %s\n" +
                        "- Departement : %s\n" +
                        "- Entreprise : WeenTime\n" +
                        "%s\n" +
                        "Le document doit etre formel, professionnel, en francais, avec la date du jour, " +
                        "les formules legales appropriees et la mention \"Pour faire valoir ce que de droit\". " +
                        "Retourne uniquement le contenu du document sans balises markdown.",
                request.getLabel(),
                request.getEmployePrenom(),
                request.getEmployeNom(),
                request.getEmployePoste(),
                request.getEmployeDepartement(),
                request.getMoisConcerne() != null ? "- Mois concerne : " + request.getMoisConcerne() : ""
        );

        AiService.AiResponse aiResponse = aiService.generateDocument(prompt);
        if (request.getDocumentId() != null) {
            service.logAiGeneration(request.getDocumentId(), getUserId(),
                    "Génération IA — " + request.getLabel());
        }
        return ResponseEntity.ok(AIGenerationResult.builder()
                .contenu(aiResponse.text())
                .tokensUsed(aiResponse.tokens())
                .modelUsed(aiResponse.model())
                .type(request.getType())
                .employeNom(request.getEmployePrenom() + " " + request.getEmployeNom())
                .dateGeneration(java.time.LocalDateTime.now().toString())
                .build());
    }

    @PostMapping("/rh/generate-ai-advanced")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<AIGenerationResult> generateAIDocumentAdvanced(@RequestBody AIAdvancedGenerationRequest request) {
        log.info("Génération avancée de document via l'IA demandée pour : {}", request.getEmployeNom());
        float temp = request.getTemperature() != null ? request.getTemperature() : 0.2f;
        String systemPrompt = "Tu es le rédacteur documentaire officiel de l'entreprise.\n" +
                "Ton : Professionnel, Formel, Neutre.\n" +
                "Retourne uniquement le contenu du document, sans balises markdown.";
        AiService.AiResponse aiResponse = aiService.generateWithGemini(
                systemPrompt,
                request.getPrompt(),
                temp
        );
        log.info("Génération avancée complétée.");
        if (request.getDocumentId() != null) {
            service.logAiGeneration(request.getDocumentId(), getUserId(),
                    "Génération IA avancée — " + request.getType());
        }
        return ResponseEntity.ok(AIGenerationResult.builder()
                .contenu(aiResponse.text())
                .tokensUsed(aiResponse.tokens())
                .modelUsed(aiResponse.model())
                .type(request.getType())
                .employeNom(request.getEmployeNom())
                .dateGeneration(java.time.LocalDateTime.now().toString())
                .build());
    }

    @GetMapping("/rh/template-variables")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<List<Map<String, String>>> getTemplateVariables() {
        log.info("Fetching available document template variables.");
        return ResponseEntity.ok(templateResolver.getAvailableVariables());
    }

    /**
     * Génère un modèle de document via l'IA à partir d'une description en langage naturel.
     * L'IA reçoit la liste exhaustive des variables disponibles et ne doit utiliser que celles-ci.
     */
    @PostMapping("/rh/generate-template-ai")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<Map<String, Object>> generateTemplateWithAI(@RequestBody Map<String, String> request) {
        String description = request.get("description");
        if (description == null || description.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La description du document est requise.");
        }

        log.info("Génération de modèle IA à partir de la description : {}", description);

        // Build the list of available variables for the system prompt
        StringBuilder variablesList = new StringBuilder();
        for (Map<String, String> v : templateResolver.getAvailableVariables()) {
            variablesList.append("  - {{").append(v.get("key")).append("}} → ").append(v.get("label")).append("\n");
        }

        String systemPrompt = """
            Tu es un expert en rédaction de documents RH administratifs français.
            
            MISSION : Génère un MODÈLE de document (template) à partir de la description de l'utilisateur.
            
            RÈGLES CRITIQUES :
            1. Utilise UNIQUEMENT les variables suivantes entourées de doubles accolades {{variable}} :
            %s
            2. N'invente JAMAIS de nouvelles variables. Si une donnée n'a pas de variable correspondante, écris le texte en dur ou utilise [À COMPLÉTER].
            3. Le document doit être formel, professionnel, en français.
            4. Retourne UNIQUEMENT le texte brut du modèle, sans balises markdown, sans titres avec #, sans explication.
            5. Utilise des retours à la ligne pour structurer le document.
            6. Inclus les formules de politesse et mentions légales appropriées.
            7. RÈGLE D'OR : Assure-toi de clore proprement toutes les balises HTML ouvertes (comme <table>, <tr>, <td>, <div>, etc.) pour éviter tout contenu tronqué.
            """.formatted(variablesList.toString());

        String userPrompt = "Génère un modèle de document pour : " + description;

        try {
            AiService.AiResponse aiResponse = aiService.generatePlainText(systemPrompt, userPrompt, 0.3f);
            return ResponseEntity.ok(Map.of(
                "template", aiResponse.text(),
                "tokensUsed", aiResponse.tokens(),
                "modelUsed", aiResponse.model()
            ));
        } catch (Exception e) {
            log.error("Erreur lors de la génération IA du modèle : {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Le service IA est momentanément indisponible. Veuillez réessayer.", e);
        }
    }

    private Long getRhEntrepriseId() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        log.info("Resolving RH enterprise context.");
        try {
            UtilisateurAuthResponse user = organisationServiceClient.getUtilisateurForAuth(email);
            if (user == null || user.getEntrepriseId() == null) {
                log.error("No enterprise found for current RH account.");
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune entreprise assignee a ce compte RH");
            }
            log.info("RH enterprise context resolved.");
            return user.getEntrepriseId();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception e) {
            log.error("Error calling organisation-service: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Impossible de recuperer l'entreprise RH courante.", e);
        }
    }

    private Long getUserId() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        log.info("Resolving current user id.");
        try {
            UtilisateurAuthResponse user = organisationServiceClient.getUtilisateurForAuth(email);
            if (user == null || user.getId() == null) {
                log.error("Authenticated user was not found in organisation-service.");
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Utilisateur authentifie introuvable.");
            }
            log.info("Current user id resolved.");
            return user.getId();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception e) {
            log.error("Error calling organisation-service: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Impossible de recuperer l'utilisateur authentifie.", e);
        }
    }

    private PageResponse<DemandeDocumentResponse> toPage(List<DemandeDocumentResponse> source, Integer page, Integer size) {
        int safePage = page == null ? 0 : Math.max(page, 0);
        int safeSize = size == null ? 100 : Math.max(size, 1);
        int start = Math.min(safePage * safeSize, source.size());
        int end = Math.min(start + safeSize, source.size());

        return PageResponse.<DemandeDocumentResponse>builder()
                .content(source.subList(start, end))
                .totalElements(source.size())
                .totalPages((int) Math.ceil((double) source.size() / safeSize))
                .number(safePage)
                .size(safeSize)
                .build();
    }
}
