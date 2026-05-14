package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.*;
import lombok.*;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DemandeDocumentResponse {
    private Long id;
    private String type;
    private String label;
    private StatutDocument statut;
    private LocalDateTime dateCreation;
    private LocalDateTime dateMiseAJour; // will map to dateDecision if present or dateCreation
    private String moisConcerne;
    private String motif;
    private String commentaireRH;
    private String documentUrl;
    private String delaiEstime;

    // Infos employé pour la vue RH
    private Long employeId;
    private String employeNom;
    private String employePrenom;
    private String employePoste;
    private String employeDepartement;
    private String employeeEmail;

    // Champs IA
    private boolean generatedByAI;
    private String contenuIA;
    private String aiModelUsed;
    private Integer tokensUsed;

    // Champs calculés
    private boolean urgente;
}
