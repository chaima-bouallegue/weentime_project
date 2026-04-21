package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateRhResponse {
    private Long id;
    private String nom;
    private String prenom;
    private String email;
    private String telephone;
    private Long entrepriseId;
    private String entrepriseNom;
    private Long departementId;
    private String departementNom;
    private Long equipeId;
    private String equipeNom;
    private java.util.Set<RoleResponse> roles;
    private String statut;
    private LocalDateTime dateCreation;
}
