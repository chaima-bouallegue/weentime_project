package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.PresenceStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DailySummaryDTO {

    private Long utilisateurId;
    private LocalDate date;
    private LocalDateTime heureEntree;
    private LocalDateTime heureSortie;
    private BigDecimal heuresTravaillees;
    private PresenceStatus status;
}
