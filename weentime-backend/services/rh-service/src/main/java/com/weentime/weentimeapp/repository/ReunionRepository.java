package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Reunion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReunionRepository extends JpaRepository<Reunion, Long> {

       Optional<Reunion> findByUuid(String uuid);

       @Query("""
           SELECT DISTINCT r
           FROM Reunion r
           JOIN FETCH r.participants p
           WHERE p.utilisateurId = :userId
           ORDER BY r.dateReunion DESC, r.heureDebut DESC
           """)
       List<Reunion> findByParticipantIdOrderByDateDesc(@Param("userId") Long userId);

       @Query("SELECT r FROM Reunion r JOIN r.participants p " +
                     "WHERE p.utilisateurId = :userId AND r.statut = 'PLANIFIEE' " +
                     "AND (r.dateReunion > CURRENT_DATE OR (r.dateReunion = CURRENT_DATE AND r.heureDebut > CURRENT_TIME)) "
                     +
                     "ORDER BY r.dateReunion ASC, r.heureDebut ASC LIMIT 1")
       Optional<Reunion> findNextReunionForUser(@Param("userId") Long userId);

       @Query("SELECT r FROM Reunion r JOIN r.participants p " +
                     "WHERE p.utilisateurId IN :userIds AND r.dateReunion = :date " +
                     "AND r.statut NOT IN ('ANNULEE') " +
                     "AND ((r.heureDebut <= :heureFin AND r.heureFin >= :heureDebut))")
       List<Reunion> findConflicts(@Param("userIds") List<Long> userIds,
                     @Param("date") LocalDate date,
                     @Param("heureDebut") LocalTime heureDebut,
                     @Param("heureFin") LocalTime heureFin);

       List<Reunion> findAllByDateReunionAndStatut(LocalDate date, com.weentime.weentimeapp.enums.ReunionStatut statut);
}
