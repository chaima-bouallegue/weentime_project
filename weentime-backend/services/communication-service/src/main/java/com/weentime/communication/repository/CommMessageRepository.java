package com.weentime.communication.repository;

import com.weentime.communication.entity.CommMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommMessageRepository extends JpaRepository<CommMessage, UUID> {

    Optional<CommMessage> findByIdAndEntrepriseId(UUID id, Long entrepriseId);

    Optional<CommMessage> findByEntrepriseIdAndSenderIdAndClientMessageId(Long entrepriseId, Long senderId, String clientMessageId);

    Optional<CommMessage> findFirstByEntrepriseIdAndChannelIdOrderByCreatedAtDescIdDesc(Long entrepriseId, UUID channelId);

    Optional<CommMessage> findFirstByEntrepriseIdAndChannelIdAndDeletedAtIsNullOrderByCreatedAtDescIdDesc(Long entrepriseId, UUID channelId);

    @Query("""
            select m
            from CommMessage m
            where m.entrepriseId = :entrepriseId
              and m.channelId = :channelId
              and m.parentMessageId is null
            order by m.createdAt desc, m.id desc
            """)
    List<CommMessage> findInitialPage(
            @Param("entrepriseId") Long entrepriseId,
            @Param("channelId") UUID channelId,
            Pageable pageable
    );

    @Query("""
            select m
            from CommMessage m
            where m.entrepriseId = :entrepriseId
              and m.channelId = :channelId
              and m.parentMessageId is null
              and (
                    m.createdAt < :beforeCreatedAt
                    or (m.createdAt = :beforeCreatedAt and m.id <> :beforeId)
                  )
            order by m.createdAt desc, m.id desc
            """)
    List<CommMessage> findBeforePage(
            @Param("entrepriseId") Long entrepriseId,
            @Param("channelId") UUID channelId,
            @Param("beforeCreatedAt") Instant beforeCreatedAt,
            @Param("beforeId") UUID beforeId,
            Pageable pageable
    );

    @Query("""
            select count(m)
            from CommMessage m
            where m.entrepriseId = :entrepriseId
              and m.channelId = :channelId
              and m.parentMessageId is null
              and m.deletedAt is null
              and m.senderId <> :userId
            """)
    long countUnreadAll(
            @Param("entrepriseId") Long entrepriseId,
            @Param("channelId") UUID channelId,
            @Param("userId") Long userId
    );

    @Query("""
            select count(m)
            from CommMessage m
            where m.entrepriseId = :entrepriseId
              and m.channelId = :channelId
              and m.parentMessageId is null
              and m.deletedAt is null
              and m.senderId <> :userId
              and m.createdAt > :lastReadAt
            """)
    long countUnreadAfterTimestamp(
            @Param("entrepriseId") Long entrepriseId,
            @Param("channelId") UUID channelId,
            @Param("userId") Long userId,
            @Param("lastReadAt") Instant lastReadAt
    );

    @Query("""
            select count(m)
            from CommMessage m
            where m.entrepriseId = :entrepriseId
              and m.channelId = :channelId
              and m.parentMessageId is null
              and m.deletedAt is null
              and m.senderId <> :userId
              and (
                    m.createdAt > :lastReadAt
                    or (m.createdAt = :lastReadAt and m.id > :lastReadMessageId)
                  )
            """)
    long countUnreadAfterTimestampAndMessage(
            @Param("entrepriseId") Long entrepriseId,
            @Param("channelId") UUID channelId,
            @Param("userId") Long userId,
            @Param("lastReadAt") Instant lastReadAt,
            @Param("lastReadMessageId") UUID lastReadMessageId
    );
    @Query("""
            select m
            from CommMessage m
            where m.entrepriseId = :entrepriseId
              and m.parentMessageId = :parentMessageId
            order by m.createdAt asc, m.id asc
            """)
    List<CommMessage> findReplies(
            @Param("entrepriseId") Long entrepriseId,
            @Param("parentMessageId") UUID parentMessageId,
            Pageable pageable
    );
}
