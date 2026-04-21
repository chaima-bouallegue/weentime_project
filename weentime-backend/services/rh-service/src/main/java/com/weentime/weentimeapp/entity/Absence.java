package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.SuperBuilder;

import java.time.LocalDate;

@Entity
@Table(name = "absences")
@PrimaryKeyJoinColumn(name = "demande_id")
@Data
@EqualsAndHashCode(callSuper = true)
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class Absence extends Demande {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "type_absence_id", nullable = false)
    private TypeAbsence typeAbsence;

    @Column(nullable = false)
    private LocalDate dateDebut;

    @Column(nullable = false)
    private LocalDate dateFin;

    @Column(name = "date_declaration", nullable = false)
    private LocalDate dateDeclaration;

    /** Durée calendaire : dateFin - dateDebut + 1 (calculée côté service) */
    @Column(name = "duree_jours")
    private Integer dureeJours;

    /** Motif de refus saisi par le RH */
    @Column(name = "motif_refus", length = 1000)
    private String motifRefus;

    /** Justificatif encodé en base64 ou nom de fichier */
    private String justificatif;
}