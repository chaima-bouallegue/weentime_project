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
@Table(name = "comm_messages", schema = "communication")
public class CommMessage {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "channel_id", nullable = false)
    private UUID channelId;

    @Column(name = "sender_id")
    private Long senderId;

    @Column(name = "parent_message_id")
    private UUID parentMessageId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private MessageType type;

    @Column(columnDefinition = "text")
    private String body;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "rich_body", columnDefinition = "jsonb")
    private String richBody;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private MessageStatus status = MessageStatus.ACTIVE;

    @Column(name = "client_message_id", length = 120)
    private String clientMessageId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String metadata = "{}";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "edited_at")
    private Instant editedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private Long deletedBy;
}
