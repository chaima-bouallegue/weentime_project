package com.weentime.communication.repository;

import com.weentime.communication.entity.CommEventStream;
import com.weentime.communication.entity.RealtimeEventScope;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommEventStreamRepository extends JpaRepository<CommEventStream, UUID> {

    Optional<CommEventStream> findByEventIdAndEntrepriseId(UUID eventId, Long entrepriseId);

    List<CommEventStream> findByEntrepriseIdAndScopeAndRecipientUserIdAndStreamOrderGreaterThanOrderByStreamOrderAsc(
            Long entrepriseId,
            RealtimeEventScope scope,
            Long recipientUserId,
            Long streamOrder
    );

    @Query("""
            select e
            from CommEventStream e
            where e.entrepriseId = :entrepriseId
              and e.scope = com.weentime.communication.entity.RealtimeEventScope.CHANNEL
              and e.channelId in :channelIds
              and e.streamOrder > :streamOrder
            order by e.streamOrder asc
            """)
    List<CommEventStream> findVisibleChannelEventsAfter(
            @Param("entrepriseId") Long entrepriseId,
            @Param("channelIds") Collection<UUID> channelIds,
            @Param("streamOrder") Long streamOrder
    );

    @Query("""
            select e
            from CommEventStream e
            where e.replayAvailableUntil < :threshold
            order by e.replayAvailableUntil asc
            """)
    List<CommEventStream> findExpiredForCleanup(@Param("threshold") Instant threshold, Pageable pageable);
}
