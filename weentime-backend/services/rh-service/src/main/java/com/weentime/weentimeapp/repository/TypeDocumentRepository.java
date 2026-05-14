package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.TypeDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TypeDocumentRepository extends JpaRepository<TypeDocument, Long> {

    Optional<TypeDocument> findByCode(String code);

    Optional<TypeDocument> findByEntrepriseIdAndCode(Long entrepriseId, String code);

    @Query("""
            select t
            from TypeDocument t
            where t.entrepriseId = :entrepriseId
               or t.entrepriseId is null
            order by
                case when t.entrepriseId is null then 1 else 0 end,
                coalesce(t.ordre, 0),
                t.libelle asc
            """)
    List<TypeDocument> findAllByEntrepriseId(@Param("entrepriseId") Long entrepriseId);

    List<TypeDocument> findByEntrepriseIdAndActifTrueOrderByOrdreAsc(Long entrepriseId);

    boolean existsByEntrepriseIdAndCode(Long entrepriseId, String code);

    boolean existsByEntrepriseIdAndLibelle(Long entrepriseId, String libelle);
}
