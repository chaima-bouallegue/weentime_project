package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.DocumentAuditLogResponse;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.entity.Document;
import com.weentime.weentimeapp.entity.DocumentAuditLog;
import com.weentime.weentimeapp.repository.DocumentAuditLogRepository;
import com.weentime.weentimeapp.repository.DocumentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentAuditService {

    private final DocumentAuditLogRepository auditRepository;
    private final DocumentRepository documentRepository;
    private final OrganisationServiceClient organisationClient;

    public static final String ACTION_REQUESTED = "DOCUMENT_REQUESTED";
    public static final String ACTION_CANCELLED = "DOCUMENT_CANCELLED";
    public static final String ACTION_STATUS_CHANGED = "STATUS_CHANGED";
    public static final String ACTION_PROCESSING_STARTED = "PROCESSING_STARTED";
    public static final String ACTION_CONTENT_MODIFIED = "CONTENT_MODIFIED";
    public static final String ACTION_VALIDATED = "DOCUMENT_VALIDATED";
    public static final String ACTION_REFUSED = "DOCUMENT_REFUSED";
    public static final String ACTION_SIGNED = "DOCUMENT_SIGNED";
    public static final String ACTION_SENT = "DOCUMENT_SENT";
    public static final String ACTION_EMAIL_SENT = "EMAIL_SENT";
    public static final String ACTION_AI_GENERATED = "AI_GENERATION_SUCCESS";
    public static final String ACTION_UPLOADED = "DOCUMENT_UPLOADED";
    public static final String ACTION_DOWNLOADED = "DOCUMENT_DOWNLOADED";

    private static final Map<String, String> ACTION_LABELS = new LinkedHashMap<>();

    static {
        ACTION_LABELS.put(ACTION_REQUESTED, "Demande créée");
        ACTION_LABELS.put(ACTION_CANCELLED, "Demande annulée");
        ACTION_LABELS.put(ACTION_STATUS_CHANGED, "Statut modifié");
        ACTION_LABELS.put(ACTION_PROCESSING_STARTED, "Traitement démarré");
        ACTION_LABELS.put(ACTION_CONTENT_MODIFIED, "Contenu modifié");
        ACTION_LABELS.put(ACTION_VALIDATED, "Document validé");
        ACTION_LABELS.put(ACTION_REFUSED, "Demande refusée");
        ACTION_LABELS.put(ACTION_SIGNED, "Document signé");
        ACTION_LABELS.put(ACTION_SENT, "Envoyé au collaborateur");
        ACTION_LABELS.put(ACTION_EMAIL_SENT, "Email de notification envoyé");
        ACTION_LABELS.put(ACTION_AI_GENERATED, "Génération IA");
        ACTION_LABELS.put(ACTION_UPLOADED, "PDF uploadé");
        ACTION_LABELS.put(ACTION_DOWNLOADED, "PDF téléchargé");
    }

    @Async
    public void log(Long documentId, Long performedBy, String action, String details) {
        if (documentId == null || performedBy == null || action == null) {
            return;
        }
        documentRepository.findById(documentId).ifPresentOrElse(
                document -> log(document.getEntrepriseId(), documentId, action, performedBy, details),
                () -> log.warn("Audit ignore : document {} introuvable", documentId)
        );
    }

    @Async
    public void log(Long entrepriseId, Long documentId, String action, Long performedBy, String details) {
        if (entrepriseId == null || performedBy == null || action == null) {
            return;
        }
        try {
            DocumentAuditLog entry = DocumentAuditLog.builder()
                    .entrepriseId(entrepriseId)
                    .documentId(documentId)
                    .action(action)
                    .performedBy(performedBy)
                    .details(details)
                    .build();
            auditRepository.save(entry);
            log.debug("Audit document {} : {}", documentId, action);
        } catch (Exception e) {
            log.error("Echec audit document {} : {}", documentId, e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<DocumentAuditLogResponse> getAuditTrail(Long documentId, Long entrepriseId) {
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document non trouve."));

        if (document.getEntrepriseId() == null || !document.getEntrepriseId().equals(entrepriseId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acces non autorise a ce document.");
        }

        try {
            return auditRepository.findByDocumentIdOrderByPerformedAtAsc(documentId).stream()
                    .map(this::toResponse)
                    .toList();
        } catch (DataAccessException e) {
            log.error("Echec lecture audit document {} (migration V23/V24 requise) : {}",
                    documentId, e.getMessage());
            return List.of();
        }
    }

    private DocumentAuditLogResponse toResponse(DocumentAuditLog entry) {
        return DocumentAuditLogResponse.builder()
                .id(entry.getId())
                .action(entry.getAction())
                .actionLabel(ACTION_LABELS.getOrDefault(entry.getAction(), entry.getAction()))
                .details(entry.getDetails())
                .performedBy(entry.getPerformedBy())
                .performedByName(resolvePerformerName(entry.getPerformedBy()))
                .performedAt(entry.getPerformedAt())
                .build();
    }

    private String resolvePerformerName(Long userId) {
        try {
            UserResponse user = organisationClient.getUtilisateurById(userId);
            if (user != null) {
                String prenom = user.getPrenom() != null ? user.getPrenom() : "";
                String nom = user.getNom() != null ? user.getNom() : "";
                String full = (prenom + " " + nom).trim();
                return full.isBlank() ? "Utilisateur #" + userId : full;
            }
        } catch (Exception e) {
            log.warn("Nom auditeur introuvable pour user {} : {}", userId, e.getMessage());
        }
        return "Utilisateur #" + userId;
    }
}
