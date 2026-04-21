package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.SuperBuilder;

import java.time.LocalDate;

@Entity
@Table(name = "conges")
@PrimaryKeyJoinColumn(name = "demande_id")
@Data
@EqualsAndHashCode(callSuper = true)
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
public class Conge extends Demande {

    @Column(nullable = false)
    private LocalDate dateDebut;

    @Column(nullable = false)
    private LocalDate dateFin;

    private Integer nombreJours;

    @Column(nullable = false)
    private Long typeCongeId;

    private Boolean justificatifFourni;
}