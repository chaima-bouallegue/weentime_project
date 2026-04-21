package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalTime;
import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkScheduleDto {
    private Long id;
    private Long utilisateurId;
    private LocalTime heureDebut;
    private LocalTime heureFin;
    private Set<String> joursTravail;
    private Integer toleranceRetardMinutes;
}
