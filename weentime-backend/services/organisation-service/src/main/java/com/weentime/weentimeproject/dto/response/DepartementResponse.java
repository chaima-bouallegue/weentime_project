package com.weentime.weentimeproject.dto.response;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DepartementResponse {

    private Long id;
    private String nom;
    private String description;
    private String codeInterne;
    private Long entrepriseId;
    private String entrepriseNom;
    private int nombreEquipes;
    private int nombreUtilisateurs;
}
