package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Entreprise;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.Optional;

@Repository
public interface EntrepriseRepository extends JpaRepository<Entreprise, Long> {
    boolean existsBySiret(String siret);
    Optional<Entreprise> findByCodeInvitationIgnoreCase(String codeInvitation);
    @Query("select e from Entreprise e where upper(replace(e.codeInvitation, ' ', '')) in :codes")
    Optional<Entreprise> findByNormalizedCodeInvitation(@Param("codes") Collection<String> codes);
    Optional<Entreprise> findByNomIgnoreCase(String nom);
}
