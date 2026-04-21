package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.weentime.weentimeapp.enums.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AutorisationDTO {

    private Long id;

    private Long utilisateurId;
    private String nomComplet;
    private Long managerId;
    
    private LocalDate dateAutorisation;

    private String motif;
    private String commentaire;

    private StatutDemandeEnum statut;
    private TypeDemandeEnum typeDemande;

    private LocalDateTime dateCreation;
    private LocalDateTime dateDecision;
    private String commentaireValidateur;

    private TypeAutorisationDTO typeAutorisation;

    private LocalTime heureDebut;
    private LocalTime heureFin;

    private Integer duree;

    @JsonProperty("createdAt")
    public LocalDateTime getCreatedAt() {
        return dateCreation;
    }
}
