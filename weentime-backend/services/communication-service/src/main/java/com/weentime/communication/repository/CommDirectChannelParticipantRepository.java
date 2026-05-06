package com.weentime.communication.repository;

import com.weentime.communication.entity.CommDirectChannelParticipant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CommDirectChannelParticipantRepository extends JpaRepository<CommDirectChannelParticipant, UUID> {

    Optional<CommDirectChannelParticipant> findByEntrepriseIdAndParticipantHash(Long entrepriseId, String participantHash);
}
