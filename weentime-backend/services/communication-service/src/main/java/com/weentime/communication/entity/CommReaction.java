package com.weentime.communication.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(name = "comm_reactions", schema = "communication")
public class CommReaction {

    @EmbeddedId
    private CommReactionId id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
