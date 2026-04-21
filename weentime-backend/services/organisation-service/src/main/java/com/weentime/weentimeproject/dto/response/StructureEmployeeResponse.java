package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StructureEmployeeResponse {
    private Long id;
    private String nom;
    private String prenom;
    private String fullName;
    private String email;
    private String telephone;
    private String poste;
    private String statut;
    private LocalDateTime dateCreation;
    private Long departementId;
    private String departement;
    private Long equipeId;
    private String equipe;
    private Long managerId;
    private String managerNom;
    private String managerEmail;
    private Long entrepriseId;
    private String entreprise;
    private List<String> roles;
}
