package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.WorkSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WorkScheduleRepository extends JpaRepository<WorkSchedule, Long> {

    Optional<WorkSchedule> findByUtilisateurId(Long utilisateurId);

    @Query("select distinct w.utilisateurId from WorkSchedule w")
    List<Long> findDistinctUtilisateurIds();
}
