package com.weentime.weentimeproject.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
@Entity
@Table(name = "entreprises")
public class Entreprise {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String nom;
    private String adresse;
    private String email;
    private String siret;

    @Column(name = "site_web")
    private String siteWeb;

    private String telephone;

    @Column(name = "logo", columnDefinition = "TEXT")
    private String logo;

    @Column(name = "primary_color")
    private String primaryColor;

    @Column(name = "secondary_color")
    private String secondaryColor;

    @Column(name = "code_invitation", unique = true, nullable = false)
    private String codeInvitation;

    @Column(name = "code_expiration")
    private LocalDateTime codeExpiration;

    @Column(name = "max_users")
    private Integer maxUsers;

    @Column(name = "current_users")
    private Integer currentUsers;

    private String secteur;

    /**
     * Statut métier : ACTIVE | SUSPENDED | CLOSED
     * Synchronisé avec estActive pour la rétrocompatibilité.
     */
    @Column(name = "status", nullable = false)
    private String status = "ACTIVE";

    @Column(name = "est_active")
    private Boolean estActive;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "entreprise")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private List<Departement> departements;

    @OneToMany(mappedBy = "entreprise")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private List<Utilisateur> utilisateurs;

    // ─────────────────────────────────────────────────────────
    // Lifecycle hooks
    // ─────────────────────────────────────────────────────────

    @PrePersist
    public void prePersist() {
        if (this.codeInvitation == null) {
            this.codeInvitation = buildCode();
        }
        if (this.codeExpiration == null) {
            this.codeExpiration = LocalDateTime.now().plusDays(30);
        }
        if (this.maxUsers == null) {
            this.maxUsers = 100;
        }
        if (this.currentUsers == null) {
            this.currentUsers = 0;
        }
        if (this.status == null) {
            this.status = "ACTIVE";
        }
        if (this.primaryColor == null) {
            this.primaryColor = "#1a73e8";
        }
        if (this.secondaryColor == null) {
            this.secondaryColor = "#34a853";
        }
        syncEstActive();
    }

    @PreUpdate
    public void preUpdate() {
        if (this.status == null) {
            this.status = "ACTIVE";
        }
        syncEstActive();
    }

    // ─────────────────────────────────────────────────────────
    // Business methods
    // ─────────────────────────────────────────────────────────

    /**
     * Régénère le code d'invitation.
     * Note : codeInvitation est updatable=false en BDD,
     * mais la régénération passe par une native query ou
     * on retire updatable=false pour ce cas précis.
     */
    public String regenerateCode() {
        this.codeInvitation = buildCode();
        this.codeExpiration = LocalDateTime.now().plusDays(30);
        return this.codeInvitation;
    }

    public void activate() {
        this.status = "ACTIVE";
        syncEstActive();
    }

    public void suspend() {
        this.status = "SUSPENDED";
        syncEstActive();
    }

    public void close() {
        this.status = "CLOSED";
        syncEstActive();
    }

    public boolean isActive() {
        return "ACTIVE".equals(this.status);
    }

    // ─────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────

    private void syncEstActive() {
        this.estActive = "ACTIVE".equals(this.status);
    }

    private String buildCode() {
        return "WEEN-" + UUID.randomUUID()
                .toString()
                .replace("-", "")
                .substring(0, 12)
                .toUpperCase();
    }
}