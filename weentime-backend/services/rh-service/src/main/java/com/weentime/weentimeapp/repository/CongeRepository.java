package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Conge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface CongeRepository extends JpaRepository<Conge, Long> {
    
    List<Conge> findByUtilisateurId(Long utilisateurId);
    
    List<Conge> findByUtilisateurIdInOrderByDateCreationDesc(List<Long> utilisateurIds);

    List<Conge> findByEntrepriseIdAndStatutOrderByDateCreationDesc(Long entrepriseId, com.weentime.weentimeapp.enums.StatutDemandeEnum statut);
    
    @Query("SELECT COUNT(c) > 0 FROM Conge c WHERE c.utilisateurId = :userId " +
           "AND c.statut NOT IN (com.weentime.weentimeapp.enums.StatutDemandeEnum.REFUSE, com.weentime.weentimeapp.enums.StatutDemandeEnum.ANNULE) " +
           "AND NOT (c.dateFin < :debut OR c.dateDebut > :fin)")
    boolean existsOverlappingConge(@Param("userId") Long userId, @Param("debut") LocalDate debut, @Param("fin") LocalDate fin);

    @Query("SELECT c FROM Conge c WHERE c.entrepriseId = :entrepriseId AND c.statut = com.weentime.weentimeapp.enums.StatutDemandeEnum.APPROUVE " +
           "AND NOT (c.dateFin < :debut OR c.dateDebut > :fin)")
    List<Conge> findApprovedForDateRange(@Param("entrepriseId") Long entrepriseId, @Param("debut") LocalDate debut, @Param("fin") LocalDate fin);

    @Query("SELECT c FROM Conge c WHERE c.utilisateurId = :userId AND c.statut = com.weentime.weentimeapp.enums.StatutDemandeEnum.APPROUVE " +
           "AND c.dateDebut <= :date AND c.dateFin >= :date")
    java.util.Optional<Conge> findApprovedForUserAndDate(@Param("userId") Long userId, @Param("date") LocalDate date);

    @Query("SELECT c FROM Conge c WHERE c.entrepriseId = :entrepriseId AND c.utilisateurId IN :ids AND c.statut = com.weentime.weentimeapp.enums.StatutDemandeEnum.APPROUVE " +
           "AND NOT (c.dateFin < :debut OR c.dateDebut > :fin)")
    List<Conge> findApprovedForUsersAndDateRange(@Param("entrepriseId") Long entrepriseId, @Param("ids") List<Long> ids, @Param("debut") LocalDate debut, @Param("fin") LocalDate fin);
}
