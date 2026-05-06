package com.weentime.communication.repository;

import com.weentime.communication.entity.CommThread;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommThreadRepository extends JpaRepository<CommThread, UUID> {

    Optional<CommThread> findByRootMessageIdAndEntrepriseId(UUID rootMessageId, Long entrepriseId);

    List<CommThread> findByRootMessageIdIn(Collection<UUID> rootMessageIds);
}
