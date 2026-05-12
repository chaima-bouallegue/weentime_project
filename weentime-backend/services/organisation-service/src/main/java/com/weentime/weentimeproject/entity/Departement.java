package com.weentime.weentimeproject.entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "departements")
public class Departement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nom;

    private String description;

    @Column(name = "code_interne", unique = true)
    private String codeInterne;

    @OneToMany(mappedBy = "departement")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private List<Equipe> equipes;

    @OneToMany(mappedBy = "departement")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private List<Utilisateur> utilisateurs;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entreprise_id")
    private Entreprise entreprise;
}
