package com.weentime.weentimeapp.client.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresenceStatsClientDto {
    private LocalDate dateFrom;
    private LocalDate dateTo;
    private long totalPresent;
    private long totalAbsent;
    private long lateCount;
    private BigDecimal totalHoursThisWeek;
    private BigDecimal totalHoursWorked;
    private String averageArrivalTime;
    private long onTimeCount;
    private BigDecimal overtimeHours;
    private long onTimeArrivals;
    private long lateArrivals;
}
