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
@Table(name = "comm_audit_log", schema = "communication")
public class CommAuditLog {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "entity_type", nullable = false, length = 60)
    private String entityType;

    @Column(name = "entity_id", nullable = false, length = 120)
    private String entityId;

    @Column(nullable = false, length = 80)
    private String action;

    @Column(name = "actor_id", nullable = false)
    private Long actorId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private String payload = "{}";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
