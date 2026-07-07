package com.weentime.communication.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Filter;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
@Table(name = "comm_channel_members", schema = "communication")
public class CommChannelMember {

    @EmbeddedId
    private CommChannelMemberId id;

    @MapsId("channelId")
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "channel_id", nullable = false)
    private CommChannel channel;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ChannelMemberRole role;

    @Column(name = "notification_level", length = 30)
    private String notificationLevel = "ALL";

    @Column(name = "last_read_message_id")
    private UUID lastReadMessageId;

    @Column(name = "last_read_at")
    private Instant lastReadAt;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    @Column(name = "left_at")
    private Instant leftAt;

    @Column(name = "is_muted", nullable = false)
    private boolean isMuted;

    @Column(name = "is_pinned", nullable = false)
    private boolean isPinned;
}
