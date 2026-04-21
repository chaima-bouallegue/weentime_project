package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.SuperBuilder;

import java.time.LocalTime;

@Entity
@Table(name = "autorisations")
@PrimaryKeyJoinColumn(name = "demande_id")
@Data
@EqualsAndHashCode(callSuper = true)
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class Autorisation extends Demande {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "type_autorisation_id", nullable = false)
    private TypeAutorisation typeAutorisation;

    private LocalTime heureDebut;

    private LocalTime heureFin;

    private Integer duree; // en minutes

    private java.time.LocalDate dateAutorisation;
}