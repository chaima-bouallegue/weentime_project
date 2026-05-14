package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "type_documents", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"entreprise_id", "code"}),
    @UniqueConstraint(columnNames = {"entreprise_id", "libelle"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entreprise_id")
    private Long entrepriseId;

    // ── Section A : Identité & Classification ──

    @Column(nullable = false)
    private String libelle;

    @Column(nullable = false)
    private String code;

    @Column(length = 50)
    @Builder.Default
    private String categorie = "ADMINISTRATIF";

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 50)
    private String icone;

    @Builder.Default
    private Integer ordre = 0;

    @Builder.Default
    private Boolean actif = true;

    // ── Section B : Moteur de Génération ──

    @Column(name = "mode_generation", length = 30)
    @Builder.Default
    private String modeGeneration = "TEMPLATE_ONLY";

    @Column(name = "content_template", columnDefinition = "TEXT")
    private String contentTemplate;

    @Column(name = "ai_prompt_template", columnDefinition = "TEXT")
    private String aiPromptTemplate;

    @Column(name = "ai_model", length = 50)
    @Builder.Default
    private String aiModel = "GEMINI_FLASH";

    @Column(name = "ai_temperature")
    @Builder.Default
    private Float aiTemperature = 0.2f;

    @Column(name = "variables_autorisees", columnDefinition = "TEXT")
    private String variablesAutorisees;

    @Column(name = "langues_disponibles", length = 100)
    @Builder.Default
    private String languesDisponibles = "fr";

    // ── Section C : Workflow & Validation ──

    @Column(name = "workflow_type", length = 30)
    @Builder.Default
    private String workflowType = "RH_VALIDATION";

    @Column(name = "niveau_confidentialite", length = 20)
    @Builder.Default
    private String niveauConfidentialite = "PUBLIC";

    @Builder.Default
    private Boolean requireSignature = false;

    @Column(name = "delai_traitement_jours")
    @Builder.Default
    private Integer delaiTraitementJours = 3;

    @Column(name = "max_demandes_par_mois")
    private Integer maxDemandesParMois;

    // ── Section D : Cycle de Vie ──

    @Column(name = "duree_validite_jours")
    private Integer dureeValiditeJours;

    @Builder.Default
    private Boolean versionning = false;

    @Column(name = "retention_mois")
    private Integer retentionMois;

    // ── Legacy (conservé pour compatibilité) ──

    @Deprecated
    private Boolean enableTemplate;
}
