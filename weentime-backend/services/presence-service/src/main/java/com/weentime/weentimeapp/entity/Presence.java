package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.PresenceSource;
import com.weentime.weentimeapp.enums.PresenceStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "presences",
        uniqueConstraints = @UniqueConstraint(name = "uk_presence_user_date", columnNames = {"utilisateur_id", "date_presence"}),
        indexes = {
                @Index(name = "idx_presence_user_date", columnList = "utilisateur_id,date_presence"),
                @Index(name = "idx_presence_status_date", columnList = "status,date_presence")
        }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Presence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "utilisateur_id", nullable = false)
    private Long utilisateurId;

    @Column(name = "date_presence", nullable = false)
    private LocalDate date;

    @Column(name = "heure_entree")
    private LocalDateTime heureEntree;

    @Column(name = "heure_sortie")
    private LocalDateTime heureSortie;

    @Column(name = "total_heures_travaillees", precision = 6, scale = 2)
    private BigDecimal totalHeuresTravaillees;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private PresenceStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PresenceSource source;

    @Column(length = 128)
    private String localisation;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    private Long version;

    @PrePersist
    void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.totalHeuresTravaillees == null) {
            this.totalHeuresTravaillees = BigDecimal.ZERO;
        }
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
