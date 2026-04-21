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
public class TeamPresenceDTO {

    private Long userId;
    private String fullName;
    private String email;
    private LocalDate date;
    private LocalDateTime checkInTime;
    private LocalDateTime checkOutTime;
    private BigDecimal workedHours;
    private PresenceStatus status;
}
