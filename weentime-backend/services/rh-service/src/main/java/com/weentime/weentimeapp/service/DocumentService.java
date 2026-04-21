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
    DemandeDocumentResponse updateStatut(Long id, UpdateStatutRequest request);

    // Endpoints RH
    List<DemandeDocumentResponse> getDemandesEntreprise(Long entrepriseId);
    StatsDocumentsDTO getStats(Long entrepriseId);
    DemandeDocumentResponse passerEnCours(Long id, Long rhUserId);
    DemandeDocumentResponse valider(Long id, ValiderDocumentRequest request);
    DemandeDocumentResponse refuser(Long id, String commentaireRH);
    DemandeDocumentResponse uploadDocumentRh(Long id, MultipartFile file, Long entrepriseId);
    Resource telechargerDocumentRh(Long id, Long entrepriseId);
}
