package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.StatutHoraireModele;
import com.weentime.weentimeapp.enums.TypeHoraireModele;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Builder.Default;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "horaire_modeles")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HoraireModele {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 160)
    private String nom;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private TypeHoraireModele type;

    @Column(name = "heures_hebdo", nullable = false)
    private Double heuresHebdo;

    @Column(name = "is_defaut", nullable = false)
    private Boolean isDefaut;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private StatutHoraireModele statut;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Default
    @OneToMany(mappedBy = "horaire", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("jourSemaine ASC")
    private List<HoraireJour> jours = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
