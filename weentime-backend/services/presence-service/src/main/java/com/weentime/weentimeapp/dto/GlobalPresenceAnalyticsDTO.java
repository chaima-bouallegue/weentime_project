package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GlobalPresenceAnalyticsDTO {
    private LocalDate date;
    private LocalDateTime generatedAt;
    private long totalTrackedUsers;
    private long presentToday;
    private long absentToday;
    private long lateToday;
    private long openSessions;
    private long closedSessions;
    private BigDecimal totalHoursWorkedToday;
    private BigDecimal averageSessionHours;
    private Map<String, Long> companyDistribution;
    private Map<String, Long> departmentDistribution;
}
