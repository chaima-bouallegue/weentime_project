package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "overtimes",
        uniqueConstraints = @UniqueConstraint(name = "uk_overtime_user_date", columnNames = {"utilisateur_id", "date_presence"}),
        indexes = @Index(name = "idx_overtime_date", columnList = "date_presence")
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Overtime {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "utilisateur_id", nullable = false)
    private Long utilisateurId;

    @Column(name = "date_presence", nullable = false)
    private LocalDate date;

    @Column(name = "heures_supplementaires", nullable = false, precision = 6, scale = 2)
    private BigDecimal heuresSupplementaires;

    @Column(nullable = false)
    private Boolean approuvee;

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
        if (this.approuvee == null) {
            this.approuvee = Boolean.FALSE;
        }
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
