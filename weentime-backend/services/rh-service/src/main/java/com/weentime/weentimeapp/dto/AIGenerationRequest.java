package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AIGenerationRequest {
    private String type;
    private String label;
    private String employeNom;
    private String employePrenom;
    private String employePoste;
    private String employeDepartement;
    private String dateEntree;
    private String moisConcerne;
    private Long documentId;
}
