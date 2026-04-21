package com.weentime.weentimeapp.dto.horaire;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HorairePlageDto {
    private Long id;
    private String type;
    private String heureDebut;
    private String heureFin;
    private Integer ordre;
}
