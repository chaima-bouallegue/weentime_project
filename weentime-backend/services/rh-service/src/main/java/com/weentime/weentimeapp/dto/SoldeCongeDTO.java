package com.weentime.weentimeapp.dto;

import lombok.*;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SoldeCongeDTO {

    private Long id;

    private Long utilisateurId;

    private Long typeCongeId;

    private Integer annee;

    private Double joursAcquis;

    private Double joursUtilises;

    private Double joursRestants;

    private Double joursEnAttente;

    private LocalDateTime dateMaj;
}