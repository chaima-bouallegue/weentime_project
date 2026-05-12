package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Demande;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface DemandeRepository extends JpaRepository<Demande, Long> {
    List<Demande> findByEntrepriseIdOrderByDateCreationDesc(Long entrepriseId);
    List<Demande> findByEntrepriseIdAndDateCreationBetweenOrderByDateCreationDesc(Long entrepriseId, LocalDateTime start, LocalDateTime end);
    List<Demande> findByUtilisateurIdInOrderByDateCreationDesc(List<Long> utilisateurIds);
    List<Demande> findByManagerIdOrderByDateCreationDesc(Long managerId);
}
