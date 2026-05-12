package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "solde_conges",
        uniqueConstraints = @UniqueConstraint(
                columnNames = {"utilisateur_id", "type_conge_id", "annee"}
        )
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SoldeConge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "utilisateur_id", nullable = false)
    private Long utilisateurId;

    @Column(nullable = false)
    private Long entrepriseId;

    @Column(name = "type_conge_id", nullable = false)
    private Long typeCongeId;

    @Column(nullable = false)
    private Integer annee;

    private Double joursAcquis;

    private Double joursUtilises;

    private Double joursRestants;

    private Double joursEnAttente;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    private LocalDateTime dateMaj;
    
    @Version
    private Long version;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        this.updatedAt = now;
        this.dateMaj = now;
    }

    @PreUpdate
    public void preUpdate() {
        LocalDateTime now = LocalDateTime.now();
        this.updatedAt = now;
        this.dateMaj = now;
    }
}
