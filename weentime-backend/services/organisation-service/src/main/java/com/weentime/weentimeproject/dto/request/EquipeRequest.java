package com.weentime.weentimeproject.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EquipeRequest {
    @NotBlank(message = "Le nom est obligatoire")
    private String nom;
    private String description;
    private Long responsableId;
    private Integer effectifMaximum;
    @NotNull(message = "Le statut d'activité est obligatoire")
    private Boolean estActive;
    @NotNull(message = "L'ID du département est obligatoire")
    private Long departementId;
}
