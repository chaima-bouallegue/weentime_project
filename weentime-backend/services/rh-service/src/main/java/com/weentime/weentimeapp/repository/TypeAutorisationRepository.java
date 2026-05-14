package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.TypeAutorisation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TypeAutorisationRepository extends JpaRepository<TypeAutorisation, Long> {
    Optional<TypeAutorisation> findByLibelle(String libelle);

    @Query("""
            select t
            from TypeAutorisation t
            where t.entrepriseId = :entrepriseId
               or t.entrepriseId is null
            order by t.libelle asc
            """)
    java.util.List<TypeAutorisation> findAllByEntrepriseId(@Param("entrepriseId") Long entrepriseId);
}
