package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserSummaryDTO {

    private Long id;
    private String nom;
    private String prenom;
    private String fullName;
    private String email;
    private String poste;
    private Long managerId;
    private Long departementId;
    private String departement;
    private Long equipeId;
    private String equipe;
    private Long entrepriseId;
    private String entreprise;
    private List<String> roles;
    private boolean active;
}
