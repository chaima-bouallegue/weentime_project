package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresenceStatsDTO {

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
    private List<DailyAttendanceStatusDTO> dailyStatuses;
}
