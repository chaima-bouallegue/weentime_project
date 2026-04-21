package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatsRhDTO {
    private long enAttente;
    private long approuveCeMois;
    private long refuseCeMois;
    private double tauxApprobation;
    private double moyenneJoursParDemande;
    private long totalDemandes;
}
