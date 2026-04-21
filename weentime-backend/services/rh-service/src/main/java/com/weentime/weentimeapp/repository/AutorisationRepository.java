package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Autorisation;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AutorisationRepository extends JpaRepository<Autorisation, Long> {

    // Pagination queries
    Page<Autorisation> findByUtilisateurId(Long utilisateurId, Pageable pageable);
    Page<Autorisation> findByManagerId(Long managerId, Pageable pageable);
    Page<Autorisation> findByEntrepriseId(Long entrepriseId, Pageable pageable);

    // KPI queries (Employee)
    long countByUtilisateurId(Long utilisateurId);
    long countByUtilisateurIdAndStatut(Long utilisateurId, StatutDemandeEnum statut);
    long countByUtilisateurIdAndDureeGreaterThan(Long utilisateurId, Integer duree);

    // KPI queries (Manager)
    long countByManagerIdAndStatut(Long managerId, StatutDemandeEnum statut);

    // KPI queries (RH)
    long countByEntrepriseId(Long entrepriseId);
    long countByEntrepriseIdAndStatut(Long entrepriseId, StatutDemandeEnum statut);
}
