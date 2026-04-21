package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "solde_audit_logs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SoldeAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String action; // e.g., "MANUAL_ADJUSTMENT", "ANNUAL_RESET", "INITIALIZATION"

    @Column(nullable = false)
    private Long utilisateurId;

    @Column(nullable = false)
    private Long typeCongeId;

    private Double ancienSolde;

    private Double nouveauSolde;

    private String motif;

    @Column(nullable = false)
    private String performBy; // Email or username of the RH

    @Column(nullable = false)
    private Integer annee;

    @Column(nullable = false)
    private LocalDateTime timestamp;

    @PrePersist
    public void prePersist() {
        this.timestamp = LocalDateTime.now();
    }
}
