package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;


@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserResponse {
    private Long id;
    private String nom;
    private String prenom;
    private String email;
    private String telephone;
    private String poste;
    private String avatarUrl;
    private String photo;
    private Long departementId;
    private String departementNom;
    private Long equipeId;
    private String equipeNom;
    private String equipe;
    private Long managerId;
    private Long entrepriseId;
}
