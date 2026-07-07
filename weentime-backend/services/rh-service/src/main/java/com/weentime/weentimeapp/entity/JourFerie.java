package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;

import java.time.LocalDate;

@Entity
@Table(name = "jours_feries")
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JourFerie {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate date;

    @Column(nullable = false)
    private String nom;

    @Column(name = "entreprise_id")
    private Long entrepriseId;

    @Column(name = "is_global")
    private boolean isGlobal;
}
