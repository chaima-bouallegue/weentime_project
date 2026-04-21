package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.TypeDemandeEnum;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CongeDTO {

    private Long id;

    private Long utilisateurId;
    private String userName;
    private String userEmail;

    private Long managerId;
    private String managerName;

    private String motif;
    private String commentaire;

    private StatutDemandeEnum statut;
    private TypeDemandeEnum typeDemande;

    private LocalDateTime dateCreation;
    private LocalDateTime dateDecision;
    private String commentaireValidateur;

    private LocalDate dateDebut;
    private LocalDate dateFin;
    private Integer nombreJours;

    private Long typeCongeId;
    private String typeCongeNom;

    private Boolean justificatifFourni;

    @JsonProperty("createdAt")
    public LocalDateTime getCreatedAt() {
        return dateCreation;
    }
}
