package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Document;
import com.weentime.weentimeapp.entity.TypeDocument;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface DocumentRepository extends JpaRepository<Document, Long> {
    List<Document> findByUtilisateurIdOrderByDateCreationDesc(Long utilisateurId);
    
    // For RH view (filtering by a list of user IDs from the same enterprise)
    List<Document> findByUtilisateurIdInOrderByDateCreationDesc(List<Long> utilisateurIds);
    
    long countByUtilisateurIdInAndStatut(List<Long> utilisateurIds, StatutDemandeEnum statut);
    
    long countByUtilisateurIdInAndDateCreationBetween(List<Long> utilisateurIds, LocalDateTime start, LocalDateTime end);

    boolean existsByUtilisateurIdAndTypeDocumentAndStatutIn(Long utilisateurId, TypeDocument type, List<StatutDemandeEnum> statuts);

    long countByUtilisateurIdAndTypeDocumentAndDateCreationAfter(Long utilisateurId, TypeDocument typeDocument, java.time.LocalDateTime after);
}
