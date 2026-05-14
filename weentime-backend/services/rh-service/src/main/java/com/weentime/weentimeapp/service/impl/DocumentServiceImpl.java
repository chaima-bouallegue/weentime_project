package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.CreateDocumentRequest;
import com.weentime.weentimeapp.dto.DemandeDocumentResponse;
import com.weentime.weentimeapp.dto.StatsDocumentsDTO;
import com.weentime.weentimeapp.dto.UpdateStatutRequest;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.dto.UtilisateurAuthResponse;
import com.weentime.weentimeapp.dto.ValiderDocumentRequest;
import com.weentime.weentimeapp.entity.Document;
import com.weentime.weentimeapp.entity.TypeDocument;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.StatutDocument;
import com.weentime.weentimeapp.enums.TypeDemandeEnum;
import com.weentime.weentimeapp.mapper.DocumentMapper;
import com.weentime.weentimeapp.repository.DocumentRepository;
import com.weentime.weentimeapp.repository.TypeDocumentRepository;
import com.weentime.weentimeapp.service.DocumentPdfGenerator;
import com.weentime.weentimeapp.service.DocumentService;
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

        List<StatutDemandeEnum> ongoingStatuts = List.of(StatutDemandeEnum.EN_ATTENTE_RH);
        if (documentRepository.existsByUtilisateurIdAndTypeDocumentAndStatutIn(userId, typeDocument, ongoingStatuts)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Une demande de ce type est deja en cours de traitement.");
        }

        Document document = Document.builder()
                .utilisateurId(userId)
                .entrepriseId(entrepriseId)
                .typeDocument(typeDocument)
                .moisConcerne(request.getMoisConcerne())
                .motif(request.getMotif())
                .statut(StatutDemandeEnum.EN_ATTENTE_RH)
                .typeDemande(TypeDemandeEnum.DOCUMENT)
                .dateCreation(LocalDateTime.now())
                .build();

        return documentMapper.toResponse(documentRepository.save(document));
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
        if (document.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Seules les demandes en attente peuvent etre annulees.");
        }

        document.setStatut(StatutDemandeEnum.ANNULE);
        document.setDateDecision(LocalDateTime.now());
        return documentMapper.toResponse(documentRepository.save(document));
    }

    @Override
    public Resource telechargerDocument(Long id, Long userId) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande non trouvee."));

        if (!document.getUtilisateurId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acces non autorise.");
        }
        return resolveDocumentResource(document);
    }

    @Override
    public DemandeDocumentResponse updateStatut(Long id, UpdateStatutRequest request) {
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

        return documentMapper.toResponse(documentRepository.save(document));
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

        long enAttente = documentRepository.countByUtilisateurIdInAndStatut(userIds, StatutDemandeEnum.EN_ATTENTE_RH);
        long enCours = 0;
        long prets = documentRepository.countByUtilisateurIdInAndStatut(userIds, StatutDemandeEnum.APPROUVE);
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

        if (document.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le document doit etre en attente pour etre traite.");
        }

        document.setStatut(StatutDemandeEnum.EN_ATTENTE_RH);
        document.setDateDecision(LocalDateTime.now());
        return enrichirResponse(documentRepository.save(document));
    }

    @Override
    public DemandeDocumentResponse valider(Long id, ValiderDocumentRequest request) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        if (request.getDocumentUrl() == null && request.getContenuIA() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Un document URL ou un contenu IA est requis pour la validation.");
        }

        document.setStatut(StatutDemandeEnum.APPROUVE);
        document.setContenuIA(request.getContenuIA());
        document.setGeneratedByAI(request.isGeneratedByAI());
        if (request.isGeneratedByAI()) {
            document.setAiModelUsed("gemini-2.0-flash");
            document.setTokensUsed(0);
        }
        document.setCommentaireValidateur(request.getCommentaireRH());
        document.setDateDecision(LocalDateTime.now());

        if (request.getDocumentUrl() != null && !request.getDocumentUrl().isBlank()) {
            document.setDocumentUrl(request.getDocumentUrl());
        } else if (request.getContenuIA() != null && !request.getContenuIA().isBlank()) {
            UserResponse user = organisationClient.getUtilisateurById(document.getUtilisateurId());
            document.setDocumentUrl(pdfGenerator.generatePdfFromContent(document, user, request.getContenuIA()));
        }

        return enrichirResponse(documentRepository.save(document));
    }

    @Override
    public DemandeDocumentResponse refuser(Long id, String commentaireRH) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        document.setStatut(StatutDemandeEnum.REFUSE);
        document.setCommentaireValidateur(commentaireRH);
        document.setDateDecision(LocalDateTime.now());

        return enrichirResponse(documentRepository.save(document));
    }

    @Override
    public DemandeDocumentResponse uploadDocumentRh(Long id, MultipartFile file, Long entrepriseId) {
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
        return enrichirResponse(documentRepository.save(document));
    }

    @Override
    public Resource telechargerDocumentRh(Long id, Long entrepriseId) {
        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        validateRhDocumentAccess(document, entrepriseId);
        return resolveDocumentResource(document);
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

        response.setUrgente(document.getStatut() == StatutDemandeEnum.EN_ATTENTE_RH
                && document.getDateCreation() != null
                && document.getDateCreation().isBefore(LocalDateTime.now().minusHours(48)));

        return response;
    }

    private List<Document> documentsEnAttente(List<Long> userIds) {
        return documentRepository.findByUtilisateurIdInOrderByDateCreationDesc(userIds).stream()
                .filter(document -> document.getStatut() == StatutDemandeEnum.EN_ATTENTE_RH)
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
        if (document.getStatut() != StatutDemandeEnum.APPROUVE) {
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

        return new FileSystemResource(file);
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
            case EN_ATTENTE_RH -> next == StatutDocument.EN_COURS || next == StatutDocument.PRET || next == StatutDocument.REFUSE;
            case APPROUVE -> false;
            default -> false;
        };

        if (!valid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transition de statut non autorisee : " + current + " -> " + next);
        }
    }

    private StatutDemandeEnum mapStatut(StatutDocument statut) {
        return switch (statut) {
            case EN_ATTENTE, EN_COURS -> StatutDemandeEnum.EN_ATTENTE_RH;
            case PRET -> StatutDemandeEnum.APPROUVE;
            case REFUSE -> StatutDemandeEnum.REFUSE;
            case ANNULE -> StatutDemandeEnum.ANNULE;
        };
    }
}
