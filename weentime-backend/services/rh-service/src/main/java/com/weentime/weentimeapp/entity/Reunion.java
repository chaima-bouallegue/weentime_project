package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.ReunionRecurrence;
import com.weentime.weentimeapp.enums.ReunionStatut;
import com.weentime.weentimeapp.enums.ReunionType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "reunions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Reunion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    @Builder.Default
    private String uuid = UUID.randomUUID().toString();

    @Column(nullable = false)
    private String titre;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "date_reunion", nullable = false)
    private LocalDate dateReunion;

    @Column(name = "heure_debut", nullable = false)
    private LocalTime heureDebut;

    @Column(name = "heure_fin", nullable = false)
    private LocalTime heureFin;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private ReunionType type = ReunionType.PRESENTIEL;

    private String lieu;

    @Column(name = "lien_visio")
    private String lienVisio;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private ReunionStatut statut = ReunionStatut.PLANIFIEE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private ReunionRecurrence recurrence = ReunionRecurrence.AUCUNE;

    @Column(name = "organisateur_id", nullable = false)
    private Long organisateurId;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "compte_rendu", columnDefinition = "TEXT")
    private String compteRendu;

    @Column(columnDefinition = "TEXT")
    private String agenda;

    @OneToMany(mappedBy = "reunion", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ParticipantReunion> participants = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public void addParticipant(ParticipantReunion participant) {
        participants.add(participant);
        participant.setReunion(this);
    }
}
