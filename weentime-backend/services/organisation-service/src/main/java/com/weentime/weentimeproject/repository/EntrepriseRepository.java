package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Entreprise;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface EntrepriseRepository extends JpaRepository<Entreprise, Long> {
    boolean existsBySiret(String siret);
    Optional<Entreprise> findByCodeInvitation(String codeInvitation);
    Optional<Entreprise> findByNomIgnoreCase(String nom);
}