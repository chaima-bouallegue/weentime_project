package com.weentime.communication.repository;

import com.weentime.communication.entity.CommChannel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommChannelRepository extends JpaRepository<CommChannel, UUID> {

    Optional<CommChannel> findByIdAndEntrepriseId(UUID id, Long entrepriseId);

    @Query("""
            select c
            from CommChannel c
            join CommChannelMember m on m.channel.id = c.id
            where c.entrepriseId = :entrepriseId
              and m.entrepriseId = :entrepriseId
              and m.id.userId = :userId
              and m.leftAt is null
            order by c.updatedAt desc
            """)
    List<CommChannel> findVisibleChannels(@Param("entrepriseId") Long entrepriseId, @Param("userId") Long userId);

    List<CommChannel> findByEntrepriseIdAndTypeAndIsArchivedFalse(Long entrepriseId, com.weentime.communication.entity.ChannelType type);

    List<CommChannel> findByEntrepriseIdAndIsArchivedFalse(Long entrepriseId);

    Optional<CommChannel> findFirstByEntrepriseIdAndType(Long entrepriseId, com.weentime.communication.entity.ChannelType type);

    Optional<CommChannel> findFirstByEntrepriseIdAndTypeAndIsArchivedFalse(Long entrepriseId, com.weentime.communication.entity.ChannelType type);

    Optional<CommChannel> findFirstByEntrepriseIdAndTypeAndSlugIgnoreCase(
            Long entrepriseId,
            com.weentime.communication.entity.ChannelType type,
            String slug
    );

    Optional<CommChannel> findFirstByEntrepriseIdAndSlugIgnoreCase(Long entrepriseId, String slug);

    Optional<CommChannel> findFirstByEntrepriseIdAndSlugIgnoreCaseAndIsArchivedFalse(Long entrepriseId, String slug);

    Optional<CommChannel> findFirstByEntrepriseIdAndTypeAndWorkflowType(
            Long entrepriseId,
            com.weentime.communication.entity.ChannelType type,
            String workflowType
    );

    Optional<CommChannel> findFirstByEntrepriseIdAndTypeAndWorkflowTypeAndIsArchivedFalse(
            Long entrepriseId,
            com.weentime.communication.entity.ChannelType type,
            String workflowType
    );

    Optional<CommChannel> findFirstByEntrepriseIdAndTypeAndEquipeId(
            Long entrepriseId,
            com.weentime.communication.entity.ChannelType type,
            Long equipeId
    );

    Optional<CommChannel> findFirstByEntrepriseIdAndTypeAndEquipeIdAndIsArchivedFalse(
            Long entrepriseId,
            com.weentime.communication.entity.ChannelType type,
            Long equipeId
    );

    Optional<CommChannel> findFirstByEntrepriseIdAndTypeAndWorkflowEntityTypeAndWorkflowEntityIdAndIsArchivedFalse(
            Long entrepriseId,
            com.weentime.communication.entity.ChannelType type,
            String workflowEntityType,
            String workflowEntityId
    );
}
