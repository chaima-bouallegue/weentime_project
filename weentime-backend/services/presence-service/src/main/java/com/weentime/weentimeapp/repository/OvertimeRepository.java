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
import java.util.Optional;

@Repository
public interface OvertimeRepository extends JpaRepository<Overtime, Long> {

    Optional<Overtime> findByUtilisateurIdAndDate(Long utilisateurId, LocalDate date);

    void deleteByUtilisateurIdAndDate(Long utilisateurId, LocalDate date);

    Page<Overtime> findByUtilisateurIdOrderByDateDesc(Long utilisateurId, Pageable pageable);

    @Query("select coalesce(sum(o.heuresSupplementaires), 0) from Overtime o where o.date between :dateFrom and :dateTo")
    BigDecimal sumHeuresSupplementairesBetween(@Param("dateFrom") LocalDate dateFrom, @Param("dateTo") LocalDate dateTo);

    @Query("select coalesce(sum(o.heuresSupplementaires), 0) from Overtime o where o.utilisateurId = :utilisateurId and o.date between :dateFrom and :dateTo")
    BigDecimal sumHeuresSupplementairesByUtilisateurIdAndDateBetween(@Param("utilisateurId") Long utilisateurId, @Param("dateFrom") LocalDate dateFrom, @Param("dateTo") LocalDate dateTo);

}
