package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.BulkNotificationRequest;
import com.weentime.weentimeapp.dto.BulkStatusRequest;
import com.weentime.weentimeapp.dto.response.PlanningResponseDTO;
import com.weentime.weentimeapp.enums.StatutJournee;
import com.weentime.weentimeapp.service.RhPlanningService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/rh/planning")
@RequiredArgsConstructor
public class RhPlanningController {

    private final RhPlanningService rhPlanningService;

    @GetMapping
    @PreAuthorize("hasAnyRole('RH', 'ADMIN')")
    public ResponseEntity<List<PlanningResponseDTO>> getPlanning(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end,
            @RequestParam(required = false) Long teamId,
            @RequestParam(required = false) Long departmentId) {
        
        return ResponseEntity.ok(rhPlanningService.getPlanning(start, end, teamId, departmentId));
    }

    @PostMapping("/bulk-status")
    @PreAuthorize("hasAnyRole('RH', 'ADMIN')")
    public ResponseEntity<Map<Long, Map<LocalDate, StatutJournee>>> getBulkStatus(
            @RequestBody BulkStatusRequest request) {
        return ResponseEntity.ok(rhPlanningService.getBulkStatus(request));
    }

    @PostMapping("/notify")
    @PreAuthorize("hasAnyRole('RH', 'ADMIN')")
    public ResponseEntity<Void> sendBulkNotification(@RequestBody BulkNotificationRequest request) {
        rhPlanningService.sendBulkNotification(request);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/is-excused")
    @PreAuthorize("isAuthenticated()")
    public StatutJournee getStatutJournee(
            @RequestParam Long userId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return rhPlanningService.getStatutJournee(userId, date);
    }
}
