package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.RSVPResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ParticipantReunionDTO {
    private Long utilisateurId;
    private RSVPResponse reponse;
    private boolean present;
    private Integer rappelMinutes;
    private String nom;    // Pour affichage frontend
    private String prenom; // Pour affichage frontend
    private String photo;  // Pour affichage frontend
}
