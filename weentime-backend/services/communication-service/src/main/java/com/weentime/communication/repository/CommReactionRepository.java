package com.weentime.communication.repository;

import com.weentime.communication.entity.CommReaction;
import com.weentime.communication.entity.CommReactionId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface CommReactionRepository extends JpaRepository<CommReaction, CommReactionId> {

    List<CommReaction> findById_MessageIdIn(Collection<UUID> messageIds);

    List<CommReaction> findById_MessageId(UUID messageId);
}
