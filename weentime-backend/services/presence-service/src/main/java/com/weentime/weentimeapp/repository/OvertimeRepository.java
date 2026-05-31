package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Overtime;
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
import com.weentime.weentimeapp.enums.OvertimeStatus;
import java.util.Optional;

@Repository
public interface OvertimeRepository extends JpaRepository<Overtime, Long> {

    Optional<Overtime> findByUtilisateurIdAndDate(Long utilisateurId, LocalDate date);

    Optional<Overtime> findByAttendanceId(Long attendanceId);

    void deleteByUtilisateurIdAndDate(Long utilisateurId, LocalDate date);

    Page<Overtime> findByUtilisateurIdOrderByDateDesc(Long utilisateurId, Pageable pageable);

    Page<Overtime> findByEntrepriseIdOrderByDateDesc(Long entrepriseId, Pageable pageable);

    List<Overtime> findByDateBetweenOrderByDateDesc(LocalDate dateFrom, LocalDate dateTo);

    List<Overtime> findByEntrepriseIdAndDateBetweenOrderByDateDesc(Long entrepriseId, LocalDate dateFrom, LocalDate dateTo);

    Page<Overtime> findByStatusOrderByDateDesc(OvertimeStatus status, Pageable pageable);

    Page<Overtime> findByStatusInOrderByDateDesc(Collection<OvertimeStatus> statuses, Pageable pageable);

    Page<Overtime> findByEntrepriseIdAndStatusOrderByDateDesc(Long entrepriseId, OvertimeStatus status, Pageable pageable);

    Page<Overtime> findByEntrepriseIdAndStatusInOrderByDateDesc(Long entrepriseId, Collection<OvertimeStatus> statuses, Pageable pageable);

    @Query("select coalesce(sum(o.heuresSupplementaires), 0) from Overtime o where o.date between :dateFrom and :dateTo")
    BigDecimal sumHeuresSupplementairesBetween(@Param("dateFrom") LocalDate dateFrom, @Param("dateTo") LocalDate dateTo);

    @Query("select coalesce(sum(o.heuresSupplementaires), 0) from Overtime o where o.utilisateurId = :utilisateurId and o.date between :dateFrom and :dateTo")
    BigDecimal sumHeuresSupplementairesByUtilisateurIdAndDateBetween(@Param("utilisateurId") Long utilisateurId, @Param("dateFrom") LocalDate dateFrom, @Param("dateTo") LocalDate dateTo);

    @Query("select coalesce(sum(o.heuresSupplementaires), 0) from Overtime o where (:entrepriseId is null or o.entrepriseId = :entrepriseId) and o.date between :dateFrom and :dateTo")
    BigDecimal sumHeuresSupplementairesByEntrepriseAndDateBetween(@Param("entrepriseId") Long entrepriseId, @Param("dateFrom") LocalDate dateFrom, @Param("dateTo") LocalDate dateTo);

    long countByUtilisateurIdAndDateBetween(Long utilisateurId, LocalDate dateFrom, LocalDate dateTo);

    long countByEntrepriseIdAndStatusIn(Long entrepriseId, Collection<OvertimeStatus> statuses);

    long countByEntrepriseIdAndStatus(Long entrepriseId, OvertimeStatus status);

    long countByStatusIn(Collection<OvertimeStatus> statuses);

    long countByStatus(OvertimeStatus status);

    @Query("select coalesce(sum(o.overtimeMinutes), 0) from Overtime o where (:entrepriseId is null or o.entrepriseId = :entrepriseId) and o.date between :dateFrom and :dateTo")
    Long sumOvertimeMinutesByEntrepriseAndDateBetween(@Param("entrepriseId") Long entrepriseId, @Param("dateFrom") LocalDate dateFrom, @Param("dateTo") LocalDate dateTo);

    @Query("select coalesce(sum(o.overtimeMinutes), 0) from Overtime o where o.utilisateurId = :utilisateurId and o.date between :dateFrom and :dateTo")
    Long sumOvertimeMinutesByUtilisateurIdAndDateBetween(@Param("utilisateurId") Long utilisateurId, @Param("dateFrom") LocalDate dateFrom, @Param("dateTo") LocalDate dateTo);

}
