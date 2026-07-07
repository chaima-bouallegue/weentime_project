package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;

@Entity
@Table(name = "type_autorisations")
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
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
