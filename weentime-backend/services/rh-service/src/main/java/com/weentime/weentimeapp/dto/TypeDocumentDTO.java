package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeDocumentDTO {
    private Long id;

    // ── Identité ──
    private String libelle;
    private String code;
    private String categorie;
    private String description;
    private String icone;
    private Integer ordre;
    private Boolean actif;

    // ── Génération ──
    private String modeGeneration;
    private String contentTemplate;
    private String aiPromptTemplate;
    private String aiModel;
    private Float aiTemperature;
    private String variablesAutorisees;
    private String languesDisponibles;

    // ── Workflow ──
    private String workflowType;
    private String niveauConfidentialite;
    private Boolean requireSignature;
    private Integer delaiTraitementJours;
    private Integer maxDemandesParMois;

    // ── Cycle de vie ──
    private Integer dureeValiditeJours;
    private Boolean versionning;
    private Integer retentionMois;

    // Legacy
    private Boolean enableTemplate;
}
