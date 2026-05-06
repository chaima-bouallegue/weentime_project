package com.weentime.communication.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "comm_events_stream", schema = "communication")
public class CommEventStream {

    @Id
    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "stream_order", insertable = false, updatable = false)
    private Long streamOrder;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RealtimeEventScope scope;

    @Column(name = "recipient_user_id")
    private Long recipientUserId;

    @Column(name = "channel_id")
    private UUID channelId;

    @Column(name = "actor_id")
    private Long actorId;

    @Column(nullable = false, length = 80)
    private String type;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private String payload = "{}";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "replay_available_until", nullable = false)
    private Instant replayAvailableUntil;
}
