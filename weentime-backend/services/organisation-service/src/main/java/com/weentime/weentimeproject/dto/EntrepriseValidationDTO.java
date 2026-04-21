package com.weentime.weentimeproject.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EntrepriseValidationDTO {
    private Long id;
    private String nom;
    private String secteur;
    private int collaborateurs;
}
