package com.weentime.communication.repository;

import com.weentime.communication.entity.CommAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CommAttachmentRepository extends JpaRepository<CommAttachment, UUID> {
    List<CommAttachment> findByMessageId(UUID messageId);
    List<CommAttachment> findByMessageIdIn(List<UUID> messageIds);
    Optional<CommAttachment> findByIdAndEntrepriseId(UUID id, Long entrepriseId);
}
