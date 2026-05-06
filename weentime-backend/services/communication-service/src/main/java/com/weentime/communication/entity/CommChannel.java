package com.weentime.communication.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "comm_channels", schema = "communication")
public class CommChannel {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private ChannelType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private ChannelVisibility visibility;

    @Column(length = 120)
    private String slug;

    @Column(nullable = false, length = 180)
    private String name;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "equipe_id")
    private Long equipeId;

    @Column(name = "workflow_type", length = 60)
    private String workflowType;

    @Column(name = "workflow_entity_type", length = 60)
    private String workflowEntityType;

    @Column(name = "workflow_entity_id", length = 80)
    private String workflowEntityId;

    @Column(name = "is_private", nullable = false)
    private boolean isPrivate = true;

    @Column(name = "is_archived", nullable = false)
    private boolean isArchived;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "archived_at")
    private Instant archivedAt;
}
