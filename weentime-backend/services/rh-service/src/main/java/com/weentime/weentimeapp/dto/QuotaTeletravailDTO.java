package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuotaTeletravailDTO {
    private Integer joursAutorises;
    private Double joursUtilises;
    private Double joursEnAttente;
    private Double joursRestants;
    private LocalDate periodeDebut;
    private LocalDate periodeFin;
}
