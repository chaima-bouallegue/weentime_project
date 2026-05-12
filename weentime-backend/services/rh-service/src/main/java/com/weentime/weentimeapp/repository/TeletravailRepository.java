package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Teletravail;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TeletravailRepository extends JpaRepository<Teletravail, Long> {

    List<Teletravail> findByUtilisateurIdOrderByDateCreationDesc(Long utilisateurId);

    List<Teletravail> findByStatutOrderByDateCreationDesc(StatutDemandeEnum statut);

    List<Teletravail> findByManagerIdOrderByDateCreationDesc(Long managerId);
    
    List<Teletravail> findByManagerIdAndStatutOrderByDateCreationDesc(Long managerId, StatutDemandeEnum statut);

    List<Teletravail> findAllByOrderByDateCreationDesc();

    @Query("SELECT COUNT(t) > 0 FROM Teletravail t WHERE t.utilisateurId = :utilisateurId " +
           "AND ((t.dateDebut <= :dateFin AND t.dateFin >= :dateDebut)) " +
           "AND t.statut IN :statuts")
    boolean existsConflictingTeletravail(
            @Param("utilisateurId") Long utilisateurId,
            @Param("dateDebut") LocalDate dateDebut,
            @Param("dateFin") LocalDate dateFin,
            @Param("statuts") List<StatutDemandeEnum> statuts);

    long countByStatut(StatutDemandeEnum statut);

    @Query("SELECT COUNT(t) FROM Teletravail t WHERE t.statut = :statut AND t.dateDecision >= :since")
    long countByStatutAndDateDecisionAfter(
            @Param("statut") StatutDemandeEnum statut,
            @Param("since") LocalDateTime since);

    @Query("SELECT COUNT(t) FROM Teletravail t WHERE t.managerId = :managerId AND t.statut = :statut AND t.dateDecision >= :since")
    long countByManagerIdAndStatutAndDateDecisionAfter(
            @Param("managerId") Long managerId,
            @Param("statut") StatutDemandeEnum statut,
            @Param("since") LocalDateTime since);

    @Query("SELECT COUNT(t) FROM Teletravail t WHERE t.dateCreation >= :since")
    long countByDateCreationAfter(@Param("since") LocalDateTime since);

    @Query("SELECT COUNT(t) FROM Teletravail t WHERE t.managerId = :managerId AND t.dateCreation >= :since")
    long countByManagerIdAndDateCreationAfter(
            @Param("managerId") Long managerId,
            @Param("since") LocalDateTime since);

    @Query("SELECT COUNT(t) FROM Teletravail t WHERE t.managerId = :managerId AND t.statut = :statut")
    long countByManagerIdAndStatut(
            @Param("managerId") Long managerId,
            @Param("statut") StatutDemandeEnum statut);

    @Query("SELECT t FROM Teletravail t WHERE t.entrepriseId = :entrepriseId AND t.statut = com.weentime.weentimeapp.enums.StatutDemandeEnum.APPROUVE " +
           "AND NOT (t.dateFin < :debut OR t.dateDebut > :fin)")
    List<Teletravail> findApprovedForDateRange(@Param("entrepriseId") Long entrepriseId, @Param("debut") LocalDate debut, @Param("fin") LocalDate fin);

    @Query("SELECT t FROM Teletravail t WHERE t.utilisateurId = :userId AND t.statut = com.weentime.weentimeapp.enums.StatutDemandeEnum.APPROUVE " +
           "AND t.dateDebut <= :date AND t.dateFin >= :date")
    java.util.Optional<Teletravail> findApprovedForUserAndDate(@Param("userId") Long userId, @Param("date") LocalDate date);

    @Query("SELECT t FROM Teletravail t WHERE t.entrepriseId = :entrepriseId AND t.utilisateurId IN :ids AND t.statut = com.weentime.weentimeapp.enums.StatutDemandeEnum.APPROUVE " +
           "AND NOT (t.dateFin < :debut OR t.dateDebut > :fin)")
    List<Teletravail> findApprovedForUsersAndDateRange(@Param("entrepriseId") Long entrepriseId, @Param("ids") List<Long> ids, @Param("debut") LocalDate debut, @Param("fin") LocalDate fin);

    @Query("SELECT COALESCE(SUM(t.nombreJours), 0.0) FROM Teletravail t " +
           "WHERE t.utilisateurId = :userId " +
           "AND MONTH(t.dateDebut) = :month AND YEAR(t.dateDebut) = :year " +
           "AND t.statut IN :statuts")
    Double sumNombreJoursByUtilisateurIdAndMonth(
            @Param("userId") Long userId,
            @Param("month") int month,
            @Param("year") int year,
            @Param("statuts") List<StatutDemandeEnum> statuts);
}
