package com.weentime.weentimeapp.dto.horaire;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HoraireDto {
    private Long id;
    private String nom;
    private String type;
    private Double heuresHebdo;
    private List<HoraireJourDto> jours;
    private Boolean isDefaut;
    private String statut;
    private Long entrepriseId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
