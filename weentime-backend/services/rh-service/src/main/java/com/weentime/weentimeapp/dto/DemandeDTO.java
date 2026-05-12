package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.TypeDemandeEnum;
import lombok.*;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DemandeDTO {

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
    
    private LocalDateTime dateDebut;
    private LocalDateTime dateFin;
    private Double nombreJours;
    private String typeCongeNom;
    private String typeAutorisation;
    private String typeDocument;

    private Map<String, Object> utilisateur;
    private Map<String, Object> manager;
}
