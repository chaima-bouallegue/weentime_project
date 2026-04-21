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

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/rh")
@RequiredArgsConstructor
public class RhDashboardCompatibilityController {

    private final RhDashboardService rhDashboardService;

    @GetMapping("/dashboard")
    @PreAuthorize("hasAnyRole('RH','ADMIN')")
    public ResponseEntity<ApiResponse<RhDashboardDTO>> getDashboard() {
        return ResponseEntity.ok(ApiResponse.success(rhDashboardService.getDashboard()));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('RH','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatsOverview() {
        RhDashboardDTO dashboard = rhDashboardService.getDashboard();
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
        Map<Integer, Long> byMonth = rhDashboardService.getDashboard().getRecentActivities().stream()
                .filter(activity -> activity.getDate() != null)
                .collect(java.util.stream.Collectors.groupingBy(
                        activity -> activity.getDate().getMonthValue(),
                        LinkedHashMap::new,
                        java.util.stream.Collectors.counting()
                ));

        for (java.time.Month month : java.time.Month.values()) {
            byMonth.putIfAbsent(month.getValue(), 0L);
        }

        return ResponseEntity.ok(ApiResponse.success(byMonth));
    }

    @GetMapping("/stats/demandes-par-type")
    @PreAuthorize("hasAnyRole('RH','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getDemandesByType() {
        RhDashboardDTO.RequestStats requestStats = rhDashboardService.getDashboard().getRequestStats();
        Map<String, Long> byType = new LinkedHashMap<>();
        byType.put("CONGE", requestStats.getLeave());
        byType.put("AUTORISATION", requestStats.getAutorisation());
        byType.put("TELETRAVAIL", requestStats.getTeletravail());
        return ResponseEntity.ok(ApiResponse.success(byType));
    }
}
