package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AbsenceDTO {

    private Long id;

    private Long utilisateurId;
    private Long managerId;

    private String motif;
    private String commentaire;

    private StatutDemandeEnum statut;
    private TypeDemandeEnum typeDemande;

    private LocalDateTime dateCreation;
    private LocalDateTime dateDecision;
    private String commentaireValidateur;

    private Long typeAbsenceId;

    private LocalDate dateDebut;
    private LocalDate dateFin;

    private String justificatif;
}