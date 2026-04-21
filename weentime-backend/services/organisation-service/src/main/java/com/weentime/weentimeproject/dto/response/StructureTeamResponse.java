package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StructureTeamResponse {
    private Long id;
    private String nom;
    private String description;
    private Long departementId;
    private String departement;
    private Long entrepriseId;
    private String entreprise;
    private Boolean estActive;
    private Integer effectifMaximum;
    private Long managerId;
    private String managerNom;
    private String managerEmail;
    private int nombreEmployes;
}
