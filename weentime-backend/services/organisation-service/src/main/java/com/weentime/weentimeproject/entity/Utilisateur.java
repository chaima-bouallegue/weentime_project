package com.weentime.weentimeproject.entity;

import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import com.weentime.weentimeproject.enums.TwoFactorTypeEnum;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.Set;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "utilisateurs")
@EntityListeners(AuditingEntityListener.class)
public class Utilisateur {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nom;

    @Column(nullable = false)
    private String prenom;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String motDePasse;

    private String telephone;

    private String poste;

    private String avatarUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StatutUtilisateurEnum statut;

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private LocalDateTime dateCreation;

    @LastModifiedDate
    private LocalDateTime dateModification;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "departement_id")
    private Departement departement;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "equipe_id")
    private Equipe equipe;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_id")
    private Utilisateur manager;

    @Column(name = "entreprise_id")
    private Long entrepriseId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entreprise_id", insertable = false, updatable = false)
    private Entreprise entreprise;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "utilisateur_roles",
            joinColumns = @JoinColumn(name = "utilisateur_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    private Set<Role> roles;

    @Column(nullable = false)
    @Builder.Default
    private boolean twoFactorEnabled = false;

    private String twoFactorSecret;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private TwoFactorTypeEnum twoFactorType = TwoFactorTypeEnum.NONE;

    @ElementCollection
    @CollectionTable(name = "utilisateur_backup_codes", joinColumns = @JoinColumn(name = "utilisateur_id"))
    @Column(name = "code")
    private Set<String> backupCodes;

    @Builder.Default
    private int failed2faAttempts = 0;

    private LocalDateTime lockoutEnd;

    @PrePersist
    public void prePersist() {
        if (this.statut == null) {
            this.statut = StatutUtilisateurEnum.ACTIF;
        }
    }

    public String getPhoto() {
        return avatarUrl;
    }

    public void setPhoto(String photo) {
        this.avatarUrl = photo;
    }
}
