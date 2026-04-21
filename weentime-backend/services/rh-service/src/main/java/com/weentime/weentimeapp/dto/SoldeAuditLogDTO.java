package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SoldeAuditLogDTO {
    private Long id;
    private String action;
    private Long utilisateurId;
    private Long typeCongeId;
    private String typeCongeNom;
    private Double ancienSolde;
    private Double nouveauSolde;
    private String motif;
    private String performBy;
    private Integer annee;
    private LocalDateTime timestamp;
}
