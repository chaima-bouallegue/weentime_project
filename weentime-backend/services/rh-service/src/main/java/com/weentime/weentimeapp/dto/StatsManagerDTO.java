package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatsManagerDTO {
    private long enAttente;
    private long valideesAujourdhui;
    private long refuseesAujourdhui;
    private long totalMois;
}
