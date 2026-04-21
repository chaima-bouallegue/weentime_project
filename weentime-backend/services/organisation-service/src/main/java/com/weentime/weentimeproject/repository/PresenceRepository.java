package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Presence;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PresenceRepository extends JpaRepository<Presence, Long> {
    Optional<Presence> findByUtilisateurIdAndDatePresence(Long utilisateurId, LocalDate datePresence);
    boolean existsByUtilisateurIdAndDatePresence(Long utilisateurId, LocalDate datePresence);
    List<Presence> findByUtilisateurIdOrderByDatePresenceDesc(Long utilisateurId);
    List<Presence> findByDatePresence(LocalDate datePresence);
}
