package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * DTO de lecture enrichi retourné par l'API.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AbsenceResponse {

    private Long id;

    // Demandeur
    private Long utilisateurId;
    private Long entrepriseId;
    private Long managerId;

    // Type d'absence
    private Long typeAbsenceId;
    private String typeAbsenceLibelle;
    private String typeAbsenceCode;
    private Boolean impactSalaire;
    private Boolean requireJustificatif;

    // Période
    private LocalDate dateDebut;
    private LocalDate dateFin;
    private Integer dureeJours;

    // Statut & workflow
    private StatutDemandeEnum statut;
    private String motif;
    private String motifRefus;
    private String justificatif;

    // Dates
    private LocalDateTime dateCreation;
    private LocalDateTime dateDecision;
    private String commentaireValidateur;
}
