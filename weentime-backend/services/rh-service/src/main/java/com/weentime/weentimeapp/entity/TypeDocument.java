package com.weentime.weentimeapp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Filter;

@Entity
@Table(name = "type_documents", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"entreprise_id", "code"}),
        @UniqueConstraint(columnNames = {"entreprise_id", "libelle"})
})
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
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

    @Column(name = "duree_validite_jours")
    private Integer dureeValiditeJours;

    @Builder.Default
    private Boolean versionning = false;

    @Column(name = "retention_mois")
    private Integer retentionMois;

    @Deprecated
    private Boolean enableTemplate;
}
