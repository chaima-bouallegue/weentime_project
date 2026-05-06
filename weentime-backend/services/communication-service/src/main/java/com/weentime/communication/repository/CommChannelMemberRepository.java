package com.weentime.communication.repository;

import com.weentime.communication.entity.CommChannelMember;
import com.weentime.communication.entity.CommChannelMemberId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommChannelMemberRepository extends JpaRepository<CommChannelMember, CommChannelMemberId> {

    boolean existsByChannel_IdAndEntrepriseIdAndId_UserIdAndLeftAtIsNull(UUID channelId, Long entrepriseId, Long userId);

    Optional<CommChannelMember> findByChannel_IdAndEntrepriseIdAndId_UserIdAndLeftAtIsNull(UUID channelId, Long entrepriseId, Long userId);

    List<CommChannelMember> findByChannel_IdAndLeftAtIsNull(UUID channelId);

    List<CommChannelMember> findByChannel_IdAndEntrepriseIdAndLeftAtIsNull(UUID channelId, Long entrepriseId);

    List<CommChannelMember> findByChannel_IdAndEntrepriseId(UUID channelId, Long entrepriseId);

    List<CommChannelMember> findByEntrepriseIdAndId_UserIdAndLeftAtIsNull(Long entrepriseId, Long userId);

    @Query("""
            select m
            from CommChannelMember m
            join fetch m.channel c
            where c.entrepriseId = :entrepriseId
            """)
    List<CommChannelMember> findByChannelEntrepriseId(@Param("entrepriseId") Long entrepriseId);

    long countByChannel_IdAndLeftAtIsNull(UUID channelId);

    @Query("""
            select m
            from CommChannelMember m
            join fetch m.channel c
            where m.entrepriseId = :entrepriseId
              and m.id.userId = :userId
              and m.leftAt is null
            order by c.updatedAt desc
            """)
    List<CommChannelMember> findVisibleMemberships(
            @Param("entrepriseId") Long entrepriseId,
            @Param("userId") Long userId
    );
}
