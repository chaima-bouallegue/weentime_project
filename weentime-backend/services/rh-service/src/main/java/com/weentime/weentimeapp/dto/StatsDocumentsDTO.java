package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatsDocumentsDTO {
    private long enAttente;
    private long enCours;
    private long prets;
    private long refuses;
    private long urgentes;
    private long totalCeMois;
    private double tauxTraitement;
}
