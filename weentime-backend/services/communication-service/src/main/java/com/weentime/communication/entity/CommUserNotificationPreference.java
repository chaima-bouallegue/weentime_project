package com.weentime.communication.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "comm_user_notification_preferences", schema = "communication")
public class CommUserNotificationPreference {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "direct_message_enabled", nullable = false)
    private boolean directMessageEnabled = true;

    @Column(name = "mention_enabled", nullable = false)
    private boolean mentionEnabled = true;

    @Column(name = "reaction_enabled", nullable = false)
    private boolean reactionEnabled;

    @Column(name = "channel_notification_mode", nullable = false, length = 30)
    private String channelNotificationMode = "ALL";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
