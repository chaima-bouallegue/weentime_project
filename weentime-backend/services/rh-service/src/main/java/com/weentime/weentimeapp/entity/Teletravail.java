package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.SuperBuilder;

import java.time.LocalDate;

@Entity
@Table(name = "teletravails")
@PrimaryKeyJoinColumn(name = "demande_id")
@Data
@EqualsAndHashCode(callSuper = true)
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class Teletravail extends Demande {

    @Column(nullable = false)
    private LocalDate dateDebut;

    @Column(nullable = false)
    private LocalDate dateFin;

    private Double nombreJours;

    private String adresse;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private com.weentime.weentimeapp.enums.TypeTeletravailEnum typeTeletravail;

    @Enumerated(EnumType.STRING)
    private com.weentime.weentimeapp.enums.PeriodeTeletravailEnum periode;

    @Column(nullable = false)
    @Builder.Default
    private String etapeActuelle = "MANAGER";

    @Column(name = "commentaire_manager")
    private String commentaireManager;

    @Column(name = "commentaire_rh")
    private String commentaireRH;
}