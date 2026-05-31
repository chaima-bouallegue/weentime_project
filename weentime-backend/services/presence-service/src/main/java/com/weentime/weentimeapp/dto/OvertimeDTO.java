package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import com.weentime.weentimeapp.enums.OvertimeStatus;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OvertimeDTO {

    private Long id;
    private Long utilisateurId;
    private Long entrepriseId;
    private Long attendanceId;
    private LocalDate date;
    private BigDecimal heuresSupplementaires;
    private Boolean approuvee;
    private LocalDateTime scheduledStart;
    private LocalDateTime scheduledEnd;
    private LocalDateTime checkInTime;
    private LocalDateTime checkOutTime;
    private LocalDateTime actualCheckOut;
    private Integer workedMinutes;
    private Integer expectedMinutes;
    private Integer overtimeMinutes;
    private String reason;
    private OvertimeStatus status;
    private Long managerId;
    private Long rhDecisionBy;
    private Long reviewedBy;
    private LocalDateTime reviewedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long version;
}
