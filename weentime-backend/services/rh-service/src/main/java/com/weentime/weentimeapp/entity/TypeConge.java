package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "type_conges")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeConge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long entrepriseId;

    @Column(nullable = false, unique = true)
    private String libelle;

    private Integer nombreJoursMax;

    private Boolean decompteJours;

    private Boolean requireJustificatif;
}