package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.CreateDocumentRequest;
import com.weentime.weentimeapp.dto.DocumentStatusChangedEvent;
import com.weentime.weentimeapp.dto.DemandeDocumentResponse;
import com.weentime.weentimeapp.dto.StatsDocumentsDTO;
import com.weentime.weentimeapp.dto.UpdateStatutRequest;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.dto.UtilisateurAuthResponse;
import com.weentime.weentimeapp.dto.ValiderDocumentRequest;
import com.weentime.weentimeapp.dto.SignerDocumentRequest;
import com.weentime.weentimeapp.entity.Document;
import com.weentime.weentimeapp.entity.TypeDocument;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.StatutDocument;
import com.weentime.weentimeapp.enums.TypeDemandeEnum;
import com.weentime.weentimeapp.mapper.DocumentMapper;
import com.weentime.weentimeapp.repository.DocumentRepository;
import com.weentime.weentimeapp.repository.TypeDocumentRepository;
import com.weentime.weentimeapp.dto.DocumentAuditLogResponse;
import com.weentime.weentimeapp.service.DocumentAuditService;
import com.weentime.weentimeapp.service.DocumentEmailService;
import com.weentime.weentimeapp.service.DocumentPdfGenerator;
import com.weentime.weentimeapp.service.DocumentService;
import com.weentime.weentimeapp.service.NotificationSender;

import static com.weentime.weentimeapp.service.DocumentAuditService.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
@SuppressWarnings("null")
public class DocumentServiceImpl implements DocumentService {

    private final DocumentRepository documentRepository;
    private final TypeDocumentRepository typeDocumentRepository;
    private final DocumentMapper documentMapper;
    private final DocumentPdfGenerator pdfGenerator;
    private final OrganisationServiceClient organisationClient;
    private final DocumentEmailService documentEmailService;
    private final NotificationSender notificationSender;
    private final DocumentAuditService documentAuditService;

    @Override
    public DemandeDocumentResponse createDemande(CreateDocumentRequest request, String userEmail) {
        UtilisateurAuthResponse user = organisationClient.getUtilisateurForAuth(userEmail);
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Utilisateur introuvable dans le service organisation.");
        }

        Long userId = user.getId();
        Long entrepriseId = user.getEntrepriseId();

        if (entrepriseId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune entreprise associee a votre profil.");
        }
        if (request.getTypeDocumentId() == null && request.getType() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le type de document est requis.");
        }

        TypeDocument typeDocument = resolveTypeDocument(request, entrepriseId);

        if (typeDocument.getMaxDemandesParMois() != null) {
            LocalDateTime startOfMonth = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0);
            long countThisMonth = documentRepository.countByUtilisateurIdAndTypeDocumentAndDateCreationAfter(
                    userId, typeDocument, startOfMonth);
            if (countThisMonth >= typeDocument.getMaxDemandesParMois()) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Quota mensuel atteint pour ce type de document (" + typeDocument.getMaxDemandesParMois() + "/mois).");
            }
        }

        List<StatutDemandeEnum> ongoingStatuts = List.of(StatutDemandeEnum.DEMANDE_RECUE, StatutDemandeEnum.EN_REVISION, StatutDemandeEnum.VALIDE, StatutDemandeEnum.SIGNE, StatutDemandeEnum.EN_ATTENTE_RH);
        if (documentRepository.existsByUtilisateurIdAndTypeDocumentAndStatutIn(userId, typeDocument, ongoingStatuts)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Une demande de ce type est deja en cours de traitement.");
        }

        Document document = Document.builder()
                .utilisateurId(userId)
                .entrepriseId(entrepriseId)
                .typeDocument(typeDocument)
                .moisConcerne(request.getMoisConcerne())
                .motif(request.getMotif())
                .statut(StatutDemandeEnum.DEMANDE_RECUE)
                .typeDemande(TypeDemandeEnum.DOCUMENT)
                .dateCreation(LocalDateTime.now())
                .build();

        Document saved = persistAndNotify(document);
        audit(saved, userId, ACTION_REQUESTED, "Type : " + typeDocument.getLibelle());
        return documentMapper.toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DemandeDocumentResponse> getMesDemandes(Long userId) {
        return documentMapper.toResponseList(documentRepository.findByUtilisateurIdOrderByDateCreationDesc(userId));
    }

    @Override
    public DemandeDocumentResponse annulerDemande(Long id, Long userId) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande non trouvee."));

        if (!document.getUtilisateurId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acces non autorise a cette demande.");
        }
        if (document.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH && document.getStatut() != StatutDemandeEnum.DEMANDE_RECUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Seules les demandes en attente peuvent etre annulees.");
        }

        document.setStatut(StatutDemandeEnum.ANNULE);
        document.setDateDecision(LocalDateTime.now());
        Document saved = persistAndNotify(document);
        audit(saved, userId, ACTION_CANCELLED, "Annulation par l'employé");
        return documentMapper.toResponse(saved);
    }

    @Override
    public Resource telechargerDocument(Long id, Long userId) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande non trouvee."));

        if (!document.getUtilisateurId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acces non autorise.");
        }
        Resource resource = resolveDocumentResource(document);
        audit(document, userId, ACTION_DOWNLOADED, "Téléchargement par l'employé");
        return resource;
    }

    @Override
    public DemandeDocumentResponse updateStatut(Long id, UpdateStatutRequest request, Long actorUserId) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande non trouvee."));

        StatutDemandeEnum currentStatut = document.getStatut();
        StatutDocument nextStatut = request.getStatut();
        validateTransition(currentStatut, nextStatut);

        StatutDemandeEnum mappedStatut = mapStatut(nextStatut);
        document.setStatut(mappedStatut);
        document.setCommentaireValidateur(request.getCommentaireRH());
        document.setDateDecision(LocalDateTime.now());

        if (mappedStatut == StatutDemandeEnum.APPROUVE) {
            UserResponse user = organisationClient.getUtilisateurById(document.getUtilisateurId());
            String pdfPath = pdfGenerator.generatePdf(document, user);
            document.setDocumentUrl(pdfPath);
        }

        Document saved = persistAndNotify(document);
        audit(saved, actorUserId, ACTION_STATUS_CHANGED,
                currentStatut.name() + " → " + mappedStatut.name());
        return documentMapper.toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DocumentAuditLogResponse> getDocumentAudit(Long id, Long entrepriseId) {
        return documentAuditService.getAuditTrail(id, entrepriseId);
    }

    @Override
    public void logAiGeneration(Long documentId, Long rhUserId, String detail) {
        if (documentId != null && rhUserId != null) {
            documentAuditService.log(documentId, rhUserId, ACTION_AI_GENERATED, detail);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] previewPdf(Long id, String contenu, Long entrepriseId) {
        Document document = documentRepository.findByIdWithTypeDocument(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        validateRhDocumentAccess(document, entrepriseId);
        UserResponse user = resolveUserForPreview(document.getUtilisateurId());
        return pdfGenerator.generatePdfPreviewBytes(document, user, contenu);
    }

    private UserResponse resolveUserForPreview(Long utilisateurId) {
        try {
            UserResponse user = organisationClient.getUtilisateurById(utilisateurId);
            if (user != null) {
                return user;
            }
        } catch (Exception e) {
            log.warn("Employe {} introuvable pour apercu PDF : {}", utilisateurId, e.getMessage());
        }
        return UserResponse.builder()
                .id(utilisateurId)
                .nom("Collaborateur")
                .prenom("")
                .build();
    }

    @Override
    public List<DemandeDocumentResponse> getDemandesEntreprise(Long entrepriseId) {
        List<Long> userIds = organisationClient.findUserIdsByEntrepriseId(entrepriseId);
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }

        List<Document> documents = documentRepository.findByUtilisateurIdInOrderByDateCreationDesc(userIds);
        return documents.stream()
                .map(this::enrichirResponse)
                .toList();
    }

    @Override
    public StatsDocumentsDTO getStats(Long entrepriseId) {
        List<Long> userIds = organisationClient.findUserIdsByEntrepriseId(entrepriseId);
        if (userIds == null || userIds.isEmpty()) {
            return new StatsDocumentsDTO();
        }

        long enAttente = documentRepository.countByUtilisateurIdInAndStatutIn(userIds, List.of(StatutDemandeEnum.EN_ATTENTE_RH, StatutDemandeEnum.DEMANDE_RECUE));
        long enCours = documentRepository.countByUtilisateurIdInAndStatut(userIds, StatutDemandeEnum.EN_REVISION);
        long prets = documentRepository.countByUtilisateurIdInAndStatutIn(userIds, List.of(StatutDemandeEnum.APPROUVE, StatutDemandeEnum.VALIDE, StatutDemandeEnum.SIGNE, StatutDemandeEnum.ENVOYE));
        long refuses = documentRepository.countByUtilisateurIdInAndStatut(userIds, StatutDemandeEnum.REFUSE);

        LocalDateTime limit = LocalDateTime.now().minusHours(48);
        long urgentes = documentsEnAttente(userIds).stream()
                .filter(document -> document.getDateCreation().isBefore(limit))
                .count();

        LocalDateTime startOfMonth = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0);
        long totalCeMois = documentRepository.countByUtilisateurIdInAndDateCreationBetween(userIds, startOfMonth, LocalDateTime.now());

        long total = enAttente + enCours + prets + refuses;
        double taux = total == 0 ? 0 : ((double) (prets + refuses) / total) * 100;

        return StatsDocumentsDTO.builder()
                .enAttente(enAttente)
                .enCours(enCours)
                .prets(prets)
                .refuses(refuses)
                .urgentes(urgentes)
                .totalCeMois(totalCeMois)
                .tauxTraitement(taux)
                .build();
    }

    @Override
    public DemandeDocumentResponse passerEnCours(Long id, Long rhUserId) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        if (document.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH && document.getStatut() != StatutDemandeEnum.DEMANDE_RECUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le document doit etre en attente pour etre traite.");
        }

        document.setStatut(StatutDemandeEnum.EN_REVISION);
        document.setDateDecision(LocalDateTime.now());
        Document saved = persistAndNotify(document);
        audit(saved, rhUserId, ACTION_PROCESSING_STARTED, "Passage en révision RH");
        return enrichirResponse(saved);
    }

    @Override
    public DemandeDocumentResponse approuver(Long id, ValiderDocumentRequest request, Long rhUserId) {
        log.info("Approbation (validation) de la demande document ID: {} par RH ID: {}", id, rhUserId);
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        if (document.getStatut() != StatutDemandeEnum.EN_REVISION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le document doit etre en cours de revision pour etre approuve.");
        }

        document.setStatut(StatutDemandeEnum.VALIDE);
        document.setContenuIA(request.getContenu());
        document.setValidatedBy(rhUserId);
        document.setValidatedAt(LocalDateTime.now());
        document.setDateDecision(LocalDateTime.now());

        Document saved = persistAndNotify(document);
        audit(saved, rhUserId, ACTION_CONTENT_MODIFIED, "Contenu approuvé par le RH");
        return enrichirResponse(saved);
    }

    @Override
    public DemandeDocumentResponse signer(Long id, SignerDocumentRequest request, Long rhUserId) {
        log.info("Signature de la demande document ID: {} par RH ID: {}, signedBy: {}", id, rhUserId, request.getSignedBy());
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        if (document.getStatut() != StatutDemandeEnum.VALIDE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le document doit etre approuve (valide) pour etre signe.");
        }

        document.setStatut(StatutDemandeEnum.SIGNE);
        document.setSignedBy(request.getSignedBy());
        document.setSignedAt(LocalDateTime.now());
        document.setDateDecision(LocalDateTime.now());

        // Generate the PDF embedding the signature block
        try {
            UserResponse user = organisationClient.getUtilisateurById(document.getUtilisateurId());
            if (user == null) {
                log.error("Utilisateur introuvable pour ID: {}", document.getUtilisateurId());
                throw new RuntimeException("Utilisateur introuvable pour la generation du PDF");
            }
            String pdfPath = pdfGenerator.generatePdfFromContent(document, user, document.getContenuIA());
            log.info("PDF genere apres signature avec succes : {}", pdfPath);
            document.setDocumentUrl(pdfPath);
        } catch (Exception e) {
            log.error("Erreur lors de la generation du PDF de signature: {}", e.getMessage(), e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur lors de la generation du PDF: " + e.getMessage());
        }

        Document saved = persistAndNotify(document);
        audit(saved, rhUserId, ACTION_SIGNED, "Signé par : " + request.getSignedBy());
        return enrichirResponse(saved);
    }

    @Override
    public DemandeDocumentResponse envoyer(Long id, Long rhUserId) {
        log.info("Envoi de la demande document ID: {} par RH ID: {}", id, rhUserId);
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        if (document.getStatut() != StatutDemandeEnum.SIGNE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le document doit etre signe pour etre envoye.");
        }

        document.setStatut(StatutDemandeEnum.ENVOYE);
        document.setDateDecision(LocalDateTime.now());

        Document saved = persistAndNotify(document);
        audit(saved, rhUserId, ACTION_SENT, "Document disponible pour l'employé");
        DemandeDocumentResponse response = enrichirResponse(saved);

        try {
            UserResponse user = organisationClient.getUtilisateurById(saved.getUtilisateurId());
            if (user != null && user.getEmail() != null && !user.getEmail().isBlank()) {
                String typeLibelle = saved.getTypeDocument() != null && saved.getTypeDocument().getLibelle() != null
                        ? saved.getTypeDocument().getLibelle()
                        : "document";
                documentEmailService.sendDocumentAvailable(user.getEmail(), user.getPrenom(), typeLibelle);
                audit(saved, rhUserId, ACTION_EMAIL_SENT, "Notification envoyée à " + user.getEmail());
            } else {
                log.warn("Email non envoye pour document ID {} : employe ou email introuvable.", id);
            }
        } catch (Exception e) {
            log.warn("Echec envoi email pour document ID {} (statut ENVOYE conserve) : {}", id, e.getMessage());
        }

        return response;
    }

    @Override
    public DemandeDocumentResponse valider(Long id, ValiderDocumentRequest request, Long rhUserId) {
        log.info("Validation de la demande document ID: {}", id);
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        if (request.getDocumentUrl() == null && request.getContenuIA() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Un document URL ou un contenu IA est requis pour la validation.");
        }

        document.setStatut(StatutDemandeEnum.APPROUVE);
        document.setContenuIA(request.getContenuIA());
        document.setGeneratedByAI(request.isGeneratedByAI());
        
        if (request.isGeneratedByAI()) {
            document.setAiModelUsed("gemini-2.5-flash-lite");
            document.setTokensUsed(0);
        }
        
        document.setCommentaireValidateur(request.getCommentaireRH());
        document.setDateDecision(LocalDateTime.now());

        try {
            if (request.getDocumentUrl() != null && !request.getDocumentUrl().isBlank()) {
                log.info("Validation via URL existante : {}", request.getDocumentUrl());
                document.setDocumentUrl(request.getDocumentUrl());
            } else if (request.getContenuIA() != null && !request.getContenuIA().isBlank()) {
                log.info("Validation via contenu IA. Generation du PDF...");
                UserResponse user = organisationClient.getUtilisateurById(document.getUtilisateurId());
                if (user == null) {
                    log.error("Utilisateur introuvable pour ID: {}", document.getUtilisateurId());
                    throw new RuntimeException("Utilisateur introuvable pour la generation du PDF");
                }
                String pdfPath = pdfGenerator.generatePdfFromContent(document, user, request.getContenuIA());
                log.info("PDF genere avec succes : {}", pdfPath);
                document.setDocumentUrl(pdfPath);
            }
        } catch (Exception e) {
            log.error("Erreur critique lors de la validation/generation PDF: {}", e.getMessage(), e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur lors de la generation du PDF final: " + e.getMessage());
        }

        Document saved = persistAndNotify(document);
        String detail = request.isGeneratedByAI() ? "Validation avec contenu IA" : "Validation du document";
        audit(saved, rhUserId, ACTION_VALIDATED, detail);
        return enrichirResponse(saved);
    }

    @Override
    public DemandeDocumentResponse refuser(Long id, String commentaireRH, Long rhUserId) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        document.setStatut(StatutDemandeEnum.REFUSE);
        document.setCommentaireValidateur(commentaireRH);
        document.setDateDecision(LocalDateTime.now());

        Document saved = persistAndNotify(document);
        audit(saved, rhUserId, ACTION_REFUSED, commentaireRH != null ? commentaireRH : "Demande refusée");
        return enrichirResponse(saved);
    }

    @Override
    public DemandeDocumentResponse uploadDocumentRh(Long id, MultipartFile file, Long entrepriseId, Long rhUserId) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        validateRhDocumentAccess(document, entrepriseId);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucun fichier PDF n'a ete fourni.");
        }
        boolean isPdf = "application/pdf".equalsIgnoreCase(file.getContentType())
                || (file.getOriginalFilename() != null && file.getOriginalFilename().toLowerCase().endsWith(".pdf"));
        if (!isPdf) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Seuls les fichiers PDF sont autorises.");
        }

        try {
            document.setDocumentUrl(storeUploadedPdf(document, file));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Impossible d'enregistrer le document RH.");
        }

        document.setStatut(StatutDemandeEnum.APPROUVE);
        document.setGeneratedByAI(false);
        document.setDateDecision(LocalDateTime.now());
        Document saved = persistAndNotify(document);
        audit(saved, rhUserId, ACTION_UPLOADED, "PDF uploadé par le RH");
        return enrichirResponse(saved);
    }

    @Override
    public Resource telechargerDocumentRh(Long id, Long entrepriseId, Long actorUserId) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        validateRhDocumentAccess(document, entrepriseId);
        Resource resource = resolveDocumentResource(document);
        audit(document, actorUserId, ACTION_DOWNLOADED, "Consultation PDF par le RH");
        return resource;
    }

    private void audit(Document document, Long performedBy, String action, String details) {
        if (document == null || document.getId() == null || performedBy == null) {
            return;
        }
        documentAuditService.log(document.getEntrepriseId(), document.getId(), action, performedBy, details);
    }

    private TypeDocument resolveTypeDocument(CreateDocumentRequest request, Long entrepriseId) {
        if (request.getTypeDocumentId() != null) {
            return typeDocumentRepository.findById(request.getTypeDocumentId())
                    .filter(typeDocument -> canAccessTypeDocument(typeDocument, entrepriseId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de document introuvable par ID."));
        }

        return typeDocumentRepository.findByEntrepriseIdAndCode(entrepriseId, request.getType())
                .or(() -> typeDocumentRepository.findAllByEntrepriseId(entrepriseId).stream()
                        .filter(typeDocument -> request.getType().equalsIgnoreCase(typeDocument.getCode()))
                        .findFirst())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de document introuvable par code: " + request.getType()));
    }

    private DemandeDocumentResponse enrichirResponse(Document document) {
        if (document == null) {
            return new DemandeDocumentResponse();
        }

        DemandeDocumentResponse response = documentMapper.toResponse(document);

        try {
            UserResponse user = organisationClient.getUtilisateurById(document.getUtilisateurId());
            if (user != null) {
                response.setEmployeId(user.getId());
                response.setEmployeNom(user.getNom());
                response.setEmployePrenom(user.getPrenom());
                response.setEmployePoste(user.getPoste());
                response.setEmployeDepartement(user.getDepartementNom());
                response.setEmployeeEmail(user.getEmail());
            }
        } catch (Exception exception) {
            log.warn("Erreur lors de l'enrichissement employe: {}", exception.getMessage());
        }

        response.setUrgente((document.getStatut() == StatutDemandeEnum.EN_ATTENTE_RH || document.getStatut() == StatutDemandeEnum.DEMANDE_RECUE)
                && document.getDateCreation() != null
                && document.getDateCreation().isBefore(LocalDateTime.now().minusHours(48)));

        return response;
    }

    private List<Document> documentsEnAttente(List<Long> userIds) {
        return documentRepository.findByUtilisateurIdInOrderByDateCreationDesc(userIds).stream()
                .filter(document -> document.getStatut() == StatutDemandeEnum.EN_ATTENTE_RH || document.getStatut() == StatutDemandeEnum.DEMANDE_RECUE)
                .toList();
    }

    private void validateRhDocumentAccess(Document document, Long entrepriseId) {
        if (document.getEntrepriseId() == null || !document.getEntrepriseId().equals(entrepriseId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acces non autorise a ce document.");
        }
    }

    private boolean canAccessTypeDocument(TypeDocument typeDocument, Long entrepriseId) {
        return typeDocument != null
                && (typeDocument.getEntrepriseId() == null || typeDocument.getEntrepriseId().equals(entrepriseId));
    }

    private Resource resolveDocumentResource(Document document) {
        if (document.getStatut() != StatutDemandeEnum.APPROUVE && document.getStatut() != StatutDemandeEnum.ENVOYE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Le document n'est pas encore pret au telechargement.");
        }

        String filePath = document.getDocumentUrl();
        File file = filePath == null || filePath.isBlank() ? null : new File(filePath);
        if ((filePath == null || filePath.isBlank() || !file.exists())
                && document.getContenuIA() != null
                && !document.getContenuIA().isBlank()) {
            UserResponse user = organisationClient.getUtilisateurById(document.getUtilisateurId());
            filePath = pdfGenerator.generatePdfFromContent(document, user, document.getContenuIA());
            document.setDocumentUrl(filePath);
            documentRepository.save(document);
            file = new File(filePath);
        }

        if (filePath == null || filePath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Fichier non trouve sur le serveur.");
        }

        if (!file.exists()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Le fichier n'existe plus sur le serveur.");
        }

        String displayName = pdfGenerator.buildDisplayFilename(document);
        return new FileSystemResource(file) {
            @Override
            public String getFilename() {
                return displayName;
            }
        };
    }

    private String storeUploadedPdf(Document document, MultipartFile file) throws IOException {
        String safeOriginalName = file.getOriginalFilename() == null
                ? "document.pdf"
                : file.getOriginalFilename().replaceAll("[^a-zA-Z0-9._-]", "_");
        String extension = safeOriginalName.toLowerCase().endsWith(".pdf") ? "" : ".pdf";
        Path directory = Paths.get("uploads", "documents", String.valueOf(document.getUtilisateurId()));
        Files.createDirectories(directory);

        Path target = directory.resolve("rh_" + document.getId() + "_" + System.currentTimeMillis() + "_" + safeOriginalName + extension);
        try (var inputStream = file.getInputStream()) {
            Files.copy(inputStream, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target.toString();
    }

    private void validateTransition(StatutDemandeEnum current, StatutDocument next) {
        boolean valid = switch (current) {
            case EN_ATTENTE_RH, DEMANDE_RECUE -> next == StatutDocument.EN_REVISION || next == StatutDocument.VALIDE || next == StatutDocument.REFUSE;
            case EN_REVISION -> next == StatutDocument.VALIDE || next == StatutDocument.REFUSE;
            case VALIDE -> next == StatutDocument.SIGNE || next == StatutDocument.REFUSE;
            case SIGNE -> next == StatutDocument.ENVOYE;
            case ENVOYE, APPROUVE -> false;
            default -> false;
        };

        if (!valid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transition de statut non autorisee : " + current + " -> " + next);
        }
    }

    private StatutDemandeEnum mapStatut(StatutDocument statut) {
        return switch (statut) {
            case DEMANDE_RECUE, EN_ATTENTE -> StatutDemandeEnum.DEMANDE_RECUE;
            case EN_REVISION, EN_COURS -> StatutDemandeEnum.EN_REVISION;
            case VALIDE -> StatutDemandeEnum.VALIDE;
            case SIGNE -> StatutDemandeEnum.SIGNE;
            case ENVOYE, PRET -> StatutDemandeEnum.ENVOYE;
            case REFUSE -> StatutDemandeEnum.REFUSE;
            case ANNULE -> StatutDemandeEnum.ANNULE;
        };
    }

    private Document persistAndNotify(Document document) {
        Document saved = documentRepository.save(document);
        publishStatusChange(saved);
        return saved;
    }

    private void publishStatusChange(Document document) {
        try {
            String employeNom = resolveEmployeNom(document.getUtilisateurId());
            String typeLibelle = document.getTypeDocument() != null && document.getTypeDocument().getLibelle() != null
                    ? document.getTypeDocument().getLibelle()
                    : "document";
            String message = buildStatusMessage(document.getStatut(), typeLibelle);
            DocumentStatusChangedEvent event = DocumentStatusChangedEvent.of(
                    document.getId(),
                    document.getStatut().name(),
                    employeNom,
                    message
            );
            notificationSender.sendToRole("rh", event);
            notificationSender.sendToUser(document.getUtilisateurId(), event);
        } catch (Exception e) {
            log.warn("Notification WebSocket document ID {} non envoyee : {}", document.getId(), e.getMessage());
        }
    }

    private String resolveEmployeNom(Long utilisateurId) {
        try {
            UserResponse user = organisationClient.getUtilisateurById(utilisateurId);
            if (user != null) {
                return (user.getPrenom() != null ? user.getPrenom() : "") + " " + (user.getNom() != null ? user.getNom() : "");
            }
        } catch (Exception e) {
            log.warn("Impossible de resoudre le nom employe {} : {}", utilisateurId, e.getMessage());
        }
        return "Collaborateur";
    }

    private String buildStatusMessage(StatutDemandeEnum statut, String typeLibelle) {
        String action = switch (statut) {
            case DEMANDE_RECUE, EN_ATTENTE_RH -> "Demande reçue";
            case EN_REVISION -> "Document en révision";
            case VALIDE -> "Document approuvé";
            case SIGNE -> "Document signé";
            case ENVOYE -> "Document envoyé";
            case APPROUVE -> "Document validé";
            case REFUSE -> "Document refusé";
            case ANNULE -> "Demande annulée";
            default -> "Statut mis à jour";
        };
        return action + " — " + typeLibelle;
    }
}
