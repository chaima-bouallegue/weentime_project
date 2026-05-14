package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.RhDashboardDTO;
import com.weentime.weentimeapp.service.RhDashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/rh")
@RequiredArgsConstructor
public class RhDashboardCompatibilityController {

    private final RhDashboardService rhDashboardService;

    @GetMapping("/dashboard")
    @PreAuthorize("hasAnyRole('RH','ADMIN')")
    public ResponseEntity<ApiResponse<RhDashboardDTO>> getDashboard() {
        return ResponseEntity.ok(ApiResponse.success(normalizeDashboard(rhDashboardService.getDashboard())));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('RH','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatsOverview() {
        RhDashboardDTO dashboard = normalizeDashboard(rhDashboardService.getDashboard());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("totalEmployees", dashboard.getTotalEmployees());
        payload.put("presentToday", dashboard.getPresentCount());
        payload.put("absentToday", dashboard.getAbsentCount());
        payload.put("pendingRequests", dashboard.getPendingRequests() == null ? 0 : dashboard.getPendingRequests().size());
        payload.put("employeesOnLeave", dashboard.getHighlightedEmployees() == null ? 0 : dashboard.getHighlightedEmployees().stream()
                .filter(employee -> "ON_LEAVE".equals(employee.getStatus()))
                .count());
        payload.put("totalHoursWorked", dashboard.getHoursWorked());
        payload.put("overtimeHours", java.math.BigDecimal.ZERO);
        payload.put("attendanceRate", dashboard.getAttendanceRate());
        payload.put("absenceRate", dashboard.getTotalEmployees() == 0 ? 0d : ((double) dashboard.getAbsentCount() / dashboard.getTotalEmployees()) * 100d);
        payload.put("requestTypeDistribution", getDemandesByType().getBody().getData());
        payload.put("requestStatusDistribution", dashboard.getRequestStatusDistribution());
        payload.put("monthlyRequestEvolution", dashboard.getMonthlyRequestEvolution());
        payload.put("departmentEmployeeCounts", dashboard.getDepartmentEmployeeCounts());
        return ResponseEntity.ok(ApiResponse.success(payload));
    }

    @GetMapping("/stats/evolution-mensuelle")
    @PreAuthorize("hasAnyRole('RH','ADMIN')")
    public ResponseEntity<ApiResponse<Map<Integer, Long>>> getMonthlyEvolution() {
        return ResponseEntity.ok(ApiResponse.success(normalizeDashboard(rhDashboardService.getDashboard()).getMonthlyRequestEvolution()));
    }

    @GetMapping("/stats/demandes-par-type")
    @PreAuthorize("hasAnyRole('RH','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getDemandesByType() {
        RhDashboardDTO.RequestStats requestStats = normalizeDashboard(rhDashboardService.getDashboard()).getRequestStats();
        Map<String, Long> byType = new LinkedHashMap<>();
        byType.put("CONGE", requestStats.getLeave());
        byType.put("AUTORISATION", requestStats.getAutorisation());
        byType.put("TELETRAVAIL", requestStats.getTeletravail());
        return ResponseEntity.ok(ApiResponse.success(byType));
    }

    private RhDashboardDTO normalizeDashboard(RhDashboardDTO source) {
        RhDashboardDTO dashboard = source == null ? new RhDashboardDTO() : source;

        if (dashboard.getHoursWorked() == null) {
            dashboard.setHoursWorked(BigDecimal.ZERO);
        }
        if (dashboard.getPendingRequests() == null) {
            dashboard.setPendingRequests(List.of());
        }
        if (dashboard.getAttendanceStats() == null) {
            dashboard.setAttendanceStats(RhDashboardDTO.AttendanceStats.builder()
                    .present(0)
                    .absent(0)
                    .remote(0)
                    .build());
        }
        if (dashboard.getRequestStats() == null) {
            dashboard.setRequestStats(RhDashboardDTO.RequestStats.builder()
                    .leave(0)
                    .autorisation(0)
                    .teletravail(0)
                    .build());
        }
        if (dashboard.getHighlightedEmployees() == null) {
            dashboard.setHighlightedEmployees(List.of());
        }
        if (dashboard.getRecentActivities() == null) {
            dashboard.setRecentActivities(List.of());
        }
        if (dashboard.getDepartmentEmployeeCounts() == null) {
            dashboard.setDepartmentEmployeeCounts(new LinkedHashMap<>());
        }
        if (dashboard.getMonthlyRequestEvolution() == null) {
            dashboard.setMonthlyRequestEvolution(new LinkedHashMap<>());
        }
        for (java.time.Month month : java.time.Month.values()) {
            dashboard.getMonthlyRequestEvolution().putIfAbsent(month.getValue(), 0L);
        }
        if (dashboard.getRequestStatusDistribution() == null) {
            dashboard.setRequestStatusDistribution(new LinkedHashMap<>());
        }
        return dashboard;
    }
}
