package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Absence;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;

@Repository
public interface AbsenceRepository extends JpaRepository<Absence, Long> {

    /**
     * Absences d'un employé dans son entreprise, avec filtre statut optionnel.
     */
    @Query("""
        SELECT a FROM Absence a
        WHERE a.utilisateurId = :utilisateurId
          AND a.entrepriseId  = :entrepriseId
          AND (:statut IS NULL OR a.statut = :statut)
          AND (:typeCode IS NULL
               OR CAST(a.typeAbsence.type AS string) = :typeCode)
        ORDER BY a.dateCreation DESC
    """)
    Page<Absence> findByUtilisateurIdAndEntrepriseId(
            @Param("utilisateurId") Long utilisateurId,
            @Param("entrepriseId")  Long entrepriseId,
            @Param("statut")        StatutDemandeEnum statut,
            @Param("typeCode")      String typeCode,
            Pageable pageable
    );

    /**
     * Toutes les absences d'une entreprise (vue RH), avec filtre statut optionnel.
     */
    @Query("""
        SELECT a FROM Absence a
        WHERE a.entrepriseId = :entrepriseId
          AND (:statut IS NULL OR a.statut = :statut)
        ORDER BY a.dateCreation DESC
    """)
    Page<Absence> findByEntrepriseId(
            @Param("entrepriseId") Long entrepriseId,
            @Param("statut")       StatutDemandeEnum statut,
            Pageable pageable
    );

    /**
     * Vérifie si une absence existante chevauche la plage [dateDebut, dateFin]
     * pour un utilisateur donné (hors annulées et refusées).
     */
    @Query("""
        SELECT COUNT(a) > 0 FROM Absence a
        WHERE a.utilisateurId = :utilisateurId
          AND a.entrepriseId  = :entrepriseId
          AND a.statut NOT IN ('ANNULE', 'REFUSE')
          AND a.dateDebut <= :dateFin
          AND a.dateFin   >= :dateDebut
          AND (:excludeId IS NULL OR a.id <> :excludeId)
    """)
    boolean existsOverlap(
            @Param("utilisateurId") Long utilisateurId,
            @Param("entrepriseId")  Long entrepriseId,
            @Param("dateDebut")     LocalDate dateDebut,
            @Param("dateFin")       LocalDate dateFin,
            @Param("excludeId")     Long excludeId
    );
}
