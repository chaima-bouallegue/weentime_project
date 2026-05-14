package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.TypeDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TypeDocumentRepository extends JpaRepository<TypeDocument, Long> {
    Optional<TypeDocument> findByCode(String code);

    @Query("""
            select t
            from TypeDocument t
            where t.entrepriseId = :entrepriseId
               or t.entrepriseId is null
            order by t.libelle asc
            """)
    java.util.List<TypeDocument> findAllByEntrepriseId(@Param("entrepriseId") Long entrepriseId);
}
