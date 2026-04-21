package com.weentime.weentimeapp.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Builder.Default;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "horaire_jours")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HoraireJour {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "horaire_id", nullable = false)
    private HoraireModele horaire;

    @Enumerated(EnumType.STRING)
    @Column(name = "jour_semaine", nullable = false, length = 16)
    private DayOfWeek jourSemaine;

    @Column(name = "est_travaille", nullable = false)
    private Boolean estTravaille;

    @Default
    @OneToMany(mappedBy = "jour", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("ordre ASC, id ASC")
    private List<HorairePlage> plages = new ArrayList<>();
}
