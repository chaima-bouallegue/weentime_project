package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Requête de génération IA avancée avec contrôle des paramètres.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AIAdvancedGenerationRequest {
    private String type;
    private String prompt;
    private String employeNom;
    private Long typeDocumentId;
    private Float temperature;
    private String language;
    private Long documentId;
}
