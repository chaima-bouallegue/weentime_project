package com.weentime.communication.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "comm_direct_channel_participants", schema = "communication")
public class CommDirectChannelParticipant {

    @Id
    @Column(name = "channel_id", nullable = false)
    private UUID channelId;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "participant_hash", nullable = false, length = 128)
    private String participantHash;

    @Column(name = "participant_count", nullable = false)
    private Integer participantCount;
}
