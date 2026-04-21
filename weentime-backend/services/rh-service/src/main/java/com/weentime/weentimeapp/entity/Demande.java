package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.*;
import com.weentime.weentimeapp.persistence.StatutDemandeConverter;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.SuperBuilder;

import java.time.LocalDateTime;

@Entity
@Table(name = "demandes")
@Inheritance(strategy = InheritanceType.JOINED)
@Data
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public abstract class Demande {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long utilisateurId;

    private Long managerId;
    
    @Column(nullable = false)
    private Long entrepriseId;


    @Column(length = 1000)
    private String motif;

    @Column(length = 1000)
    private String commentaire;

    @Column(nullable = false)
    @Convert(converter = StatutDemandeConverter.class)
    private StatutDemandeEnum statut;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TypeDemandeEnum typeDemande;

    @Column(nullable = false, updatable = false)
    private LocalDateTime dateCreation;

    private LocalDateTime dateDecision;

    @Column(length = 1000)
    private String commentaireValidateur;

    @Version
    private Long version;

    @PrePersist
    protected void onCreate() {

        this.dateCreation = LocalDateTime.now();

        if (this.statut == null) {
            if (this instanceof Document || this instanceof Absence) {
                this.statut = StatutDemandeEnum.EN_ATTENTE_RH;
            } else {
                this.statut = StatutDemandeEnum.EN_ATTENTE_MANAGER;
            }
        }

        if (this.typeDemande == null) {

            if (this instanceof Conge) {
                this.typeDemande = TypeDemandeEnum.CONGE;
            } else if (this instanceof Autorisation) {
                this.typeDemande = TypeDemandeEnum.AUTORISATION;
            } else if (this instanceof Teletravail) {
                this.typeDemande = TypeDemandeEnum.TELETRAVAIL;
            } else if (this instanceof Document) {
                this.typeDemande = TypeDemandeEnum.DOCUMENT;
            } else if (this instanceof Absence) {
                this.typeDemande = TypeDemandeEnum.ABSENCE;
            }
        }
    }
}
