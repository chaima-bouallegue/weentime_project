package com.weentime.weentimeapp.dto.horaire;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HoraireJourDto {
    private Long id;
    private String jourSemaine;
    private Boolean estTravaille;
    private List<HorairePlageDto> plages;
}
