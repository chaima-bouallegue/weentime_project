package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "type_autorisations")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeAutorisation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entreprise_id")
    private Long entrepriseId;

    @Column(nullable = false, unique = true)
    private String libelle;

    private Integer maxHeuresMois; // Max hours per month for this type

    private Boolean requireJustificatif;
}
