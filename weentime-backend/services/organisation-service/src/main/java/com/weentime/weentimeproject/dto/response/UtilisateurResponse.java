package com.weentime.weentimeproject.dto.response;

import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Set;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UtilisateurResponse {
    private Long id;
    private String nom;
    private String prenom;
    private String email;
    private String telephone;
    private String poste;
    private String avatarUrl;
    private String photo;
    private StatutUtilisateurEnum statut;
    private LocalDateTime dateCreation;
    private LocalDateTime dateModification;
    private Long departementId;
    private String departementNom;
    private Long equipeId;
    private String equipeNom;
    private String equipe;
    private Long managerId;
    private Long entrepriseId;
    private String entrepriseNom;
    private Set<RoleResponse> roles;
    private Set<String> permissions;
}
