package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StatsAutorisationDTO {
    private long total;
    private long enAttente;
    private long approuvees;
    private long seuil; // Requests > 120min
}
