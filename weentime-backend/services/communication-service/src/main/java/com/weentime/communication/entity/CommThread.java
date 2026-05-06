package com.weentime.communication.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "comm_threads", schema = "communication")
public class CommThread {

    @Id
    @Column(name = "root_message_id", nullable = false)
    private UUID rootMessageId;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "channel_id", nullable = false)
    private UUID channelId;

    @Column(name = "reply_count", nullable = false)
    private Integer replyCount;

    @Column(name = "last_reply_id")
    private UUID lastReplyId;

    @Column(name = "last_reply_at")
    private Instant lastReplyAt;

    @Column(name = "participant_count", nullable = false)
    private Integer participantCount;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
