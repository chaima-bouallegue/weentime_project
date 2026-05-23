package com.weentime.weentimeapp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

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

    @Column(name = "entreprise_id")
    private Long entrepriseId;

    @Column(nullable = false, unique = true)
    private String libelle;

    private Integer nombreJoursMax;

    private Boolean decompteJours;

    private Boolean requireJustificatif;
}
