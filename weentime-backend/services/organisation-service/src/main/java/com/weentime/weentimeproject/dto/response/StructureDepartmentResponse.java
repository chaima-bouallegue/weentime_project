package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StructureDepartmentResponse {
    private Long id;
    private String nom;
    private String description;
    private String codeInterne;
    private Long entrepriseId;
    private String entrepriseNom;
    private int nombreEquipes;
    private int nombreEmployes;
}
