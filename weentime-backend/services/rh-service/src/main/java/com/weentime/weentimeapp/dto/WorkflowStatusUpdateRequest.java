package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.TypeDemandeEnum;
import lombok.Data;

@Data
public class WorkflowStatusUpdateRequest {
    private StatutDemandeEnum statut;
    private TypeDemandeEnum typeDemande;
    private String commentaire;
}
