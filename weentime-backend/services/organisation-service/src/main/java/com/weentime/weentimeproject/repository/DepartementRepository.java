package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Departement;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DepartementRepository extends JpaRepository<Departement, Long> {
    boolean existsByCodeInterneAndEntrepriseId(String codeInterne, Long entrepriseId);
    boolean existsByNomIgnoreCaseAndEntreprise_Id(String nom, Long entrepriseId);
    boolean existsByCodeInterne(@NotBlank(message = "Le code interne est obligatoire") @Pattern(regexp = "^[A-Z0-9-]+$", message = "Le code interne doit contenir uniquement des lettres majuscules, chiffres et tirets") String codeInterne);
    List<Departement> findByEntreprise_IdOrderByNomAsc(Long entrepriseId);
    Page<Departement> findByEntreprise_Id(Long entrepriseId, Pageable pageable);
}
