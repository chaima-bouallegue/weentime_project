package com.weentime.weentimeapp.dto;

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
public class OvertimeDTO {

    private Long id;
    private Long utilisateurId;
    private LocalDate date;
    private BigDecimal heuresSupplementaires;
    private Boolean approuvee;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long version;
}
