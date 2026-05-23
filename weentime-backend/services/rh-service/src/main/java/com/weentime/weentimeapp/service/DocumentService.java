package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.*;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface DocumentService {
    DemandeDocumentResponse createDemande(CreateDocumentRequest request, String userEmail);
    List<DemandeDocumentResponse> getMesDemandes(Long userId);
    DemandeDocumentResponse annulerDemande(Long id, Long userId);
    Resource telechargerDocument(Long id, Long userId);
    DemandeDocumentResponse updateStatut(Long id, UpdateStatutRequest request, Long actorUserId);

    List<DemandeDocumentResponse> getDemandesEntreprise(Long entrepriseId);
    StatsDocumentsDTO getStats(Long entrepriseId);
    DemandeDocumentResponse passerEnCours(Long id, Long rhUserId);
    DemandeDocumentResponse valider(Long id, ValiderDocumentRequest request, Long rhUserId);
    DemandeDocumentResponse refuser(Long id, String commentaireRH, Long rhUserId);
    DemandeDocumentResponse approuver(Long id, ValiderDocumentRequest request, Long rhUserId);
    DemandeDocumentResponse signer(Long id, SignerDocumentRequest request, Long rhUserId);
    DemandeDocumentResponse envoyer(Long id, Long rhUserId);
    DemandeDocumentResponse uploadDocumentRh(Long id, MultipartFile file, Long entrepriseId, Long rhUserId);
    Resource telechargerDocumentRh(Long id, Long entrepriseId, Long actorUserId);
    List<DocumentAuditLogResponse> getDocumentAudit(Long id, Long entrepriseId);

    void logAiGeneration(Long documentId, Long rhUserId, String detail);

    byte[] previewPdf(Long id, String contenu, Long entrepriseId);
}
