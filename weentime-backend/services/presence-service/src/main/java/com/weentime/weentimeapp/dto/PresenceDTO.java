package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.PresenceSource;
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
public class PresenceDTO {

    private Long id;
    private Long utilisateurId;
    private LocalDate date;
    private LocalDateTime heureEntree;
    private LocalDateTime heureSortie;
    private BigDecimal totalHeuresTravaillees;
    private PresenceStatus status;
    private PresenceSource source;
    private String localisation;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long version;
}
