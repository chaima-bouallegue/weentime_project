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

    @org.springframework.data.jpa.repository.Query("SELECT a FROM Autorisation a WHERE a.entrepriseId = :entrepriseId AND a.statut = com.weentime.weentimeapp.enums.StatutDemandeEnum.APPROUVE " +
           "AND a.dateAutorisation BETWEEN :debut AND :fin")
    java.util.List<Autorisation> findApprovedForDateRange(@org.springframework.data.repository.query.Param("entrepriseId") Long entrepriseId, @org.springframework.data.repository.query.Param("debut") java.time.LocalDate debut, @org.springframework.data.repository.query.Param("fin") java.time.LocalDate fin);

    @org.springframework.data.jpa.repository.Query("SELECT a FROM Autorisation a WHERE a.utilisateurId = :userId AND a.statut = com.weentime.weentimeapp.enums.StatutDemandeEnum.APPROUVE " +
           "AND a.dateAutorisation = :date")
    java.util.Optional<Autorisation> findApprovedForUserAndDate(@org.springframework.data.repository.query.Param("userId") Long userId, @org.springframework.data.repository.query.Param("date") java.time.LocalDate date);

    @org.springframework.data.jpa.repository.Query("SELECT a FROM Autorisation a WHERE a.entrepriseId = :entrepriseId AND a.utilisateurId IN :ids AND a.statut = com.weentime.weentimeapp.enums.StatutDemandeEnum.APPROUVE " +
           "AND a.dateAutorisation BETWEEN :debut AND :fin")
    java.util.List<Autorisation> findApprovedForUsersAndDateRange(@org.springframework.data.repository.query.Param("entrepriseId") Long entrepriseId, @org.springframework.data.repository.query.Param("ids") java.util.List<Long> ids, @org.springframework.data.repository.query.Param("debut") java.time.LocalDate debut, @org.springframework.data.repository.query.Param("fin") java.time.LocalDate fin);
}
