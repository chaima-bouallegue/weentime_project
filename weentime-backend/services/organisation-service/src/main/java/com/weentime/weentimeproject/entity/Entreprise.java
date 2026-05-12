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

    @Column(name = "code_invitation")
    private String codeInvitation;

    @Column(name = "code_expiration")
    private LocalDateTime codeExpiration;

    @Column(name = "max_users")
    private Integer maxUsers;

    @Column(name = "current_users")
    private Integer currentUsers;

    private String secteur;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "est_active")
    private Boolean estActive;

    @OneToMany(mappedBy = "entreprise")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private List<Departement> departements;

    @OneToMany(mappedBy = "entreprise")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private List<Utilisateur> utilisateurs;

    @PrePersist
    public void prePersist() {
        if (this.codeInvitation == null) {
            this.codeInvitation = generateCode();
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
        if (this.estActive == null) {
            this.estActive = Boolean.TRUE;
        }
    }

    @PreUpdate
    public void preUpdate() {
        if (this.estActive == null) {
            this.estActive = Boolean.TRUE;
        }
    }

    public String regenerateCode() {
        this.codeInvitation = generateCode();
        this.codeExpiration = LocalDateTime.now().plusDays(30);
        return this.codeInvitation;
    }

    private String generateCode() {
        return "WEEN-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
    }
}
