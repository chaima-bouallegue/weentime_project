package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.JourFerie;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface JourFerieRepository extends JpaRepository<JourFerie, Long> {

    @Query("SELECT j FROM JourFerie j WHERE j.isGlobal = true OR j.entrepriseId = :entrepriseId")
    List<JourFerie> findAllByEntrepriseId(@Param("entrepriseId") Long entrepriseId);

    @Query("SELECT j FROM JourFerie j WHERE (j.isGlobal = true OR j.entrepriseId = :entrepriseId) " +
           "AND j.date BETWEEN :start AND :end")
    List<JourFerie> findByEntrepriseIdAndDateBetween(
            @Param("entrepriseId") Long entrepriseId,
            @Param("start") LocalDate start,
            @Param("end") LocalDate end);

    boolean existsByDateAndEntrepriseId(LocalDate date, Long entrepriseId);

    @Query("SELECT j FROM JourFerie j WHERE (j.isGlobal = true OR j.entrepriseId = :entrepriseId) AND j.date = :date")
    List<JourFerie> findByDateAndEntrepriseId(@Param("date") LocalDate date, @Param("entrepriseId") Long entrepriseId);
}
