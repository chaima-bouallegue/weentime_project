package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SoldeDetailDTO {
    private Long typeCongeId;
    private String typeNom;
    private Integer joursMax;
    private Double joursRestants;
    private Double joursUtilises;
    private Double joursEnAttente;
}
