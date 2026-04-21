package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Presence;
import com.weentime.weentimeapp.enums.PresenceStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface PresenceRepository extends JpaRepository<Presence, Long> {

    Optional<Presence> findByUtilisateurIdAndDate(Long utilisateurId, LocalDate date);

    boolean existsByUtilisateurIdAndDate(Long utilisateurId, LocalDate date);

    Page<Presence> findByUtilisateurIdOrderByDateDesc(Long utilisateurId, Pageable pageable);

    List<Presence> findByUtilisateurIdInAndDate(Collection<Long> utilisateurIds, LocalDate date);

    long countByDateBetweenAndStatusIn(LocalDate startDate, LocalDate endDate, Collection<PresenceStatus> statuses);

    long countByDateBetweenAndStatus(LocalDate startDate, LocalDate endDate, PresenceStatus status);

    @Query("select p from Presence p where p.date = :date and p.status = :status")
    Page<Presence> findByDateAndStatus(@Param("date") LocalDate date, @Param("status") PresenceStatus status, Pageable pageable);

    // User-specific statistics queries
    long countByUtilisateurIdAndDateBetweenAndStatusIn(Long utilisateurId, LocalDate dateStart, LocalDate dateEnd, Collection<PresenceStatus> statuses);

    long countByUtilisateurIdAndDateBetweenAndStatus(Long utilisateurId, LocalDate dateStart, LocalDate dateEnd, PresenceStatus status);

    @Query("select sum(p.totalHeuresTravaillees) from Presence p where p.utilisateurId = :utilisateurId and p.date between :dateStart and :dateEnd")
    BigDecimal sumWorkHoursByUtilisateurIdAndDateBetween(@Param("utilisateurId") Long utilisateurId, @Param("dateStart") LocalDate dateStart, @Param("dateEnd") LocalDate dateEnd);
}
