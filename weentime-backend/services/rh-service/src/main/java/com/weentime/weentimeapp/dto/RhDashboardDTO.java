package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RhDashboardDTO {
    private long totalEmployees;
    private long presentCount;
    private long absentCount;
    private BigDecimal hoursWorked;
    private double attendanceRate;
    private List<DashboardLeaveRequestDTO> pendingRequests;
    private AttendanceStats attendanceStats;
    private RequestStats requestStats;
    private List<DashboardEmployeeDTO> highlightedEmployees;
    private List<DashboardActivityDTO> recentActivities;
    private Map<String, Long> departmentEmployeeCounts;
    private Map<Integer, Long> monthlyRequestEvolution;
    private Map<String, Long> requestStatusDistribution;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AttendanceStats {
        private long present;
        private long absent;
        private long remote;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RequestStats {
        private long leave;
        private long autorisation;
        private long teletravail;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DashboardEmployeeDTO {
        private Long id;
        private String firstName;
        private String lastName;
        private String email;
        private String role;
        private String department;
        private String status;
        private String team;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DashboardLeaveRequestDTO {
        private Long id;
        private Long userId;
        private String type;
        private LocalDate startDate;
        private LocalDate endDate;
        private String status;
        private Long validatedBy;
        private String employeeName;
        private String employeeEmail;
        private String department;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DashboardActivityDTO {
        private String id;
        private String title;
        private String description;
        private LocalDateTime date;
        private String type;
        private String route;
    }
}
