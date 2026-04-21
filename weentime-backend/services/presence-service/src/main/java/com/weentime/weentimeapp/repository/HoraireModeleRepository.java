package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.HoraireModele;
import com.weentime.weentimeapp.enums.StatutHoraireModele;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface HoraireModeleRepository extends JpaRepository<HoraireModele, Long> {

    Page<HoraireModele> findByEntrepriseIdOrderByUpdatedAtDesc(Long entrepriseId, Pageable pageable);

    Optional<HoraireModele> findFirstByEntrepriseIdAndIsDefautTrueAndStatutOrderByUpdatedAtDesc(
            Long entrepriseId,
            StatutHoraireModele statut
    );
}
