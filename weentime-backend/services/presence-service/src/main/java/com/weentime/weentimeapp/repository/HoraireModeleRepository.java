package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.HoraireModele;
import com.weentime.weentimeapp.enums.StatutHoraireModele;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface HoraireModeleRepository extends JpaRepository<HoraireModele, Long> {

    Page<HoraireModele> findByEntrepriseIdOrderByUpdatedAtDesc(Long entrepriseId, Pageable pageable);

    Optional<HoraireModele> findFirstByEntrepriseIdAndIsDefautTrueAndStatutOrderByUpdatedAtDesc(
            Long entrepriseId,
            StatutHoraireModele statut
    );

    @Query("SELECT DISTINCT hm FROM HoraireModele hm " +
           "LEFT JOIN FETCH hm.jours hj " +
           "WHERE hm.entrepriseId = :entrepriseId AND hm.isDefaut = true AND hm.statut = :statut " +
           "ORDER BY hm.updatedAt DESC")
    List<HoraireModele> findDefaultByEntrepriseIdWithJoursAndPlages(
            @Param("entrepriseId") Long entrepriseId,
            @Param("statut") StatutHoraireModele statut
    );
}
