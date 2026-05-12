package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.AffectationHoraire;
import com.weentime.weentimeapp.enums.CibleType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AffectationHoraireRepository extends JpaRepository<AffectationHoraire, Long> {

    Page<AffectationHoraire> findByEntrepriseIdOrderByCreatedAtDesc(Long entrepriseId, Pageable pageable);

    List<AffectationHoraire> findByEntrepriseId(Long entrepriseId);

    List<AffectationHoraire> findByEntrepriseIdAndCibleTypeAndCibleId(Long entrepriseId, CibleType cibleType, Long cibleId);

    List<AffectationHoraire> findByHoraireId(Long horaireId);
}
