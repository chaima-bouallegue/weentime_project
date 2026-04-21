package com.weentime.weentimeproject.dto;

import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UtilisateurDTO {

    private Long id;
    private String nom;
    private String prenom;
    private String email;
    private String motDePasse;
    private String telephone;
    private String poste;
    private StatutUtilisateurEnum statut;
    private LocalDateTime dateCreation;
    private LocalDateTime dateModification;
    private Long departementId;
    private Long equipeId;
    private List<Long> roleIds;
}
