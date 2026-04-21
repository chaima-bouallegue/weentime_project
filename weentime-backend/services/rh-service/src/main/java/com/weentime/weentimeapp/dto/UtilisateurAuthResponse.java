package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UtilisateurAuthResponse {
    private Long id;
    private String email;
    private String nom;
    private String prenom;
    private String poste;
    private Long entrepriseId;
    private Long managerId;
}
