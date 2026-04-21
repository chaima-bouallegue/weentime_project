package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EquipeResponse {
    private Long id;
    private String nom;
    private String description;
    private Long responsableId;
    private Integer effectifMaximum;
    private Boolean estActive;
    private Long departementId;
    private String departementNom;
    private Long entrepriseId;
    private String entrepriseNom;
}
