package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.weentime.weentimeapp.enums.PeriodeTeletravailEnum;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.TypeTeletravailEnum;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TeletravailResponseDTO {
    private Long id;
    private Long utilisateurId;
    private String employeNom;
    private String employePrenom;
    private String employePoste;
    private String employeDepartement;
    private TypeTeletravailEnum type;
    private String label;
    private StatutDemandeEnum statut;
    private LocalDate dateDebut;
    private LocalDate dateFin;
    private Double nombreJours;
    private PeriodeTeletravailEnum periode;
    private String motif;
    private String etapeActuelle;
    private String commentaireManager;
    private String commentaireRH;
    private LocalDateTime dateCreation;
    private LocalDateTime dateDecision;

    @JsonProperty("createdAt")
    public LocalDateTime getCreatedAt() {
        return dateCreation;
    }
}
