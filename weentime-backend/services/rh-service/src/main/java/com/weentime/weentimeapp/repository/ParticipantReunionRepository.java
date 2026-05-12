package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.ParticipantReunion;
import com.weentime.weentimeapp.entity.ParticipantReunion.ParticipantReunionId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ParticipantReunionRepository extends JpaRepository<ParticipantReunion, ParticipantReunionId> {
    Optional<ParticipantReunion> findById_ReunionIdAndId_UtilisateurId(Long reunionId, Long utilisateurId);
}
