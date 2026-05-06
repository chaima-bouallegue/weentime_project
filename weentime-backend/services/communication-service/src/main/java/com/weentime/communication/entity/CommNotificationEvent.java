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
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "comm_notification_events", schema = "communication")
public class CommNotificationEvent {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "notification_event_id", nullable = false, length = 180, unique = true)
    private String notificationEventId;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "recipient_id", nullable = false)
    private Long recipientId;

    @Column(name = "event_type", nullable = false, length = 80)
    private String eventType;

    @Column(name = "group_key", length = 180)
    private String groupKey;

    @Column(name = "channel_id")
    private UUID channelId;

    @Column(name = "message_id")
    private UUID messageId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private String payload = "{}";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private NotificationEventStatus status = NotificationEventStatus.PENDING;

    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount = 0;

    @Column(name = "last_error", columnDefinition = "text")
    private String lastError;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "sent_at")
    private Instant sentAt;
}
