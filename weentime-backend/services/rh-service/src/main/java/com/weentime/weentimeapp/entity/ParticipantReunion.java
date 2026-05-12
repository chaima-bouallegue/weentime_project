package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.RSVPResponse;
import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;

@Entity
@Table(name = "participants_reunion")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ParticipantReunion {

    @EmbeddedId
    private ParticipantReunionId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("reunionId")
    @JoinColumn(name = "reunion_id")
    private Reunion reunion;

    @Column(name = "utilisateur_id", insertable = false, updatable = false)
    private Long utilisateurId;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private RSVPResponse reponse = RSVPResponse.EN_ATTENTE;

    @Builder.Default
    private boolean present = false;

    @Column(name = "rappel_minutes")
    @Builder.Default
    private Integer rappelMinutes = 30;

    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    @Builder
    public static class ParticipantReunionId implements Serializable {
        @Column(name = "reunion_id")
        private Long reunionId;
        @Column(name = "utilisateur_id")
        private Long utilisateurId;
    }
}
