package com.weentime.weentimeproject.dto;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EquipeDTO {

    private Long id;
    private String nom;
    private String description;
    private Long departementId;
    private Long responsableId;
    private Integer effectifMaximum;
    private Boolean estActive;
}
