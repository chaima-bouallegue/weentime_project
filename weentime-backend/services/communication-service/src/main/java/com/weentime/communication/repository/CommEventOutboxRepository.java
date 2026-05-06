package com.weentime.communication.repository;

import com.weentime.communication.entity.CommEventOutbox;
import com.weentime.communication.entity.OutboxStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommEventOutboxRepository extends JpaRepository<CommEventOutbox, UUID> {

    boolean existsByIdempotencyKey(String idempotencyKey);

    Optional<CommEventOutbox> findByIdempotencyKey(String idempotencyKey);

    long countByStatus(OutboxStatus status);

    @Query("""
            select e
            from CommEventOutbox e
            where e.status in :statuses
              and (e.nextAttemptAt is null or e.nextAttemptAt <= :now)
            order by e.createdAt asc
            """)
    List<CommEventOutbox> findDispatchBatch(
            @Param("statuses") List<OutboxStatus> statuses,
            @Param("now") Instant now,
            Pageable pageable
    );

    @Query("""
            select e.eventType, count(e)
            from CommEventOutbox e
            where e.status = :status
            group by e.eventType
            """)
    List<Object[]> countByStatusGroupedByEventType(@Param("status") OutboxStatus status);
}
