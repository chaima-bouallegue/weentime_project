package com.weentime.communication.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
@Table(name = "comm_message_history", schema = "communication")
public class CommMessageHistory {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "message_id", nullable = false)
    private UUID messageId;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "edited_by", nullable = false)
    private Long editedBy;

    @Column(name = "previous_body", columnDefinition = "text")
    private String previousBody;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "previous_rich_body", columnDefinition = "jsonb")
    private String previousRichBody;

    @Column(name = "edited_at", nullable = false)
    private Instant editedAt;

    @Column(columnDefinition = "text")
    private String reason;
}
