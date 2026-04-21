package com.weentime.weentimeapp.dto.horaire;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AffectationHoraireDto {
    private Long id;
    private Long horaireId;
    private String horaireNom;
    private String cibleType;
    private Long cibleId;
    private String cibleLabel;
    private LocalDate dateDebut;
    private LocalDate dateFin;
    private String motif;
    private Integer priorite;
    private Long entrepriseId;
    private LocalDateTime createdAt;
}
