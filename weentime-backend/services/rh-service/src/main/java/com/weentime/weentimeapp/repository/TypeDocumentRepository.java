package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.TypeDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TypeDocumentRepository extends JpaRepository<TypeDocument, Long> {

    Optional<TypeDocument> findByCode(String code);

    Optional<TypeDocument> findByEntrepriseIdAndCode(Long entrepriseId, String code);

    List<TypeDocument> findAllByEntrepriseId(Long entrepriseId);

    List<TypeDocument> findByEntrepriseIdAndActifTrueOrderByOrdreAsc(Long entrepriseId);

    boolean existsByEntrepriseIdAndCode(Long entrepriseId, String code);

    boolean existsByEntrepriseIdAndLibelle(Long entrepriseId, String libelle);
}
