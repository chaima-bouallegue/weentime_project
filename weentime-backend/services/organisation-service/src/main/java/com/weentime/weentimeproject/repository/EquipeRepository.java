package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Equipe;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EquipeRepository extends JpaRepository<Equipe, Long> {
    boolean existsByNom(@NotBlank(message = "Le nom est obligatoire") String nom);
    boolean existsByNomAndDepartementId(String nom, Long departementId);

    @EntityGraph(attributePaths = {"responsable", "departement", "departement.entreprise", "membres"})
    List<Equipe> findByDepartement_Entreprise_IdOrderByNomAsc(Long entrepriseId);

    @EntityGraph(attributePaths = {"responsable", "departement", "departement.entreprise"})
    List<Equipe> findByDepartement_IdOrderByNomAsc(Long departementId);

    @EntityGraph(attributePaths = {"responsable", "departement", "departement.entreprise"})
    Page<Equipe> findByDepartement_Entreprise_Id(Long entrepriseId, Pageable pageable);
}
