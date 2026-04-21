package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmployeeSoldeResponse {
    private Long utilisateurId;
    private String nom;
    private String prenom;
    private Boolean isInitialised;
    private List<SoldeDetailDTO> soldes;
}
