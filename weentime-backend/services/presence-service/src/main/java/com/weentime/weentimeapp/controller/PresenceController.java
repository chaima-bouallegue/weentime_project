package com.weentime.weentimeapp.controller;

// trigger ci: re-run frontend pipeline after Lucide icons fix

import com.weentime.weentimeapp.dto.AttendanceSessionDTO;
import com.weentime.weentimeapp.dto.AttendanceSessionViewDTO;
import com.weentime.weentimeapp.dto.AttendanceSummaryDTO;
import com.weentime.weentimeapp.dto.CheckInRequest;
import com.weentime.weentimeapp.dto.CheckOutRequest;
import com.weentime.weentimeapp.dto.GlobalPresenceAnalyticsDTO;
import com.weentime.weentimeapp.dto.PresenceHistoryResponse;
import com.weentime.weentimeapp.dto.PresenceSessionResponse;
import com.weentime.weentimeapp.dto.PresenceStatsDTO;
import com.weentime.weentimeapp.dto.TeamStatusResponse;
import com.weentime.weentimeapp.dto.TodayPresenceResponse;
import com.weentime.weentimeapp.dto.response.ApiResponse;
import com.weentime.weentimeapp.enums.PresenceSource;
import com.weentime.weentimeapp.mapper.PresenceApiMapper;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.config.PresenceProperties;
import com.weentime.weentimeapp.service.PresenceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Test commit: validating Docker Hub credentials fix in pipeline
@RestController
@RequestMapping({"/api/v1/presence", "/api/v1/presences", "/api/presence"})
@RequiredArgsConstructor
@Slf4j
public class PresenceController {

    private static final String PERSONAL_POINTAGE_ROLES =
            "hasAnyAuthority('ROLE_EMPLOYEE','ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','EMPLOYEE','MANAGER','RH','ADMIN')";

    private final PresenceService presenceService;
    private final SecurityUtils securityUtils;
    private final PresenceApiMapper presenceApiMapper;
    private final PresenceProperties presenceProperties;

    @PostMapping({"/check-in", "/attendance/start", "/me/check-in"})
    @PreAuthorize(PERSONAL_POINTAGE_ROLES)
    public ResponseEntity<ApiResponse<TodayPresenceResponse>> checkIn(@Valid @RequestBody(required = false) CheckInRequest request) {
        CheckInRequest safeRequest = request == null ? CheckInRequest.builder().build() : request;
        if (safeRequest.getSource() == null) {
            safeRequest.setSource(PresenceSource.WEB);
        }
        Long userId = securityUtils.getCurrentUserId();
        log.info("Received check-in request for user {} from source {}", userId, safeRequest.getSource());
        AttendanceSummaryDTO summary = presenceService.checkIn(userId, safeRequest);
        return ResponseEntity.ok(ApiResponse.success(buildPersonalTodayResponse(userId, summary)));
    }

    @PostMapping({"/check-out", "/me/check-out"})
    @PreAuthorize(PERSONAL_POINTAGE_ROLES)
    public ResponseEntity<ApiResponse<TodayPresenceResponse>> checkOut(@Valid @RequestBody(required = false) CheckOutRequest request) {
        Long userId = securityUtils.getCurrentUserId();
        log.info("Received check-out request for user {}", userId);
        AttendanceSummaryDTO summary = presenceService.checkOut(userId, request);
        return ResponseEntity.ok(ApiResponse.success(buildPersonalTodayResponse(userId, summary)));
    }

    @PostMapping("/me/overtime/continue")
    @PreAuthorize(PERSONAL_POINTAGE_ROLES)
    public ResponseEntity<ApiResponse<TodayPresenceResponse>> continueOvertime() {
        Long userId = securityUtils.getCurrentUserId();
        log.info("Received overtime continue request for user {}", userId);
        AttendanceSummaryDTO summary = presenceService.continueOvertime(userId);
        return ResponseEntity.ok(ApiResponse.success(buildPersonalTodayResponse(userId, summary)));
    }

    @GetMapping({"/today", "/me/today", "/status/today"})
    @PreAuthorize(PERSONAL_POINTAGE_ROLES)
    public ResponseEntity<ApiResponse<TodayPresenceResponse>> getTodayAttendance() {
        Long userId = securityUtils.getCurrentUserId();
        log.info("Fetching today attendance for user {}", userId);
        AttendanceSummaryDTO summary = presenceService.getTodayAttendance(userId);
        return ResponseEntity.ok(ApiResponse.success(buildPersonalTodayResponse(userId, summary)));
    }

    @GetMapping({"/active-session", "/attendance/active-session"})
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<PresenceSessionResponse>> getActiveSession() {
        Long userId = securityUtils.getCurrentUserId();
        AttendanceSummaryDTO summary = presenceService.getTodayAttendance(userId);
        PresenceSessionResponse response = presenceApiMapper.toSessionResponse(
                summary.getActiveSession(),
                java.time.ZoneId.of(presenceProperties.getTimezone())
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping({"/history", "/me", "/me/history"})
    @PreAuthorize(PERSONAL_POINTAGE_ROLES)
    public ResponseEntity<ApiResponse<PresenceHistoryResponse>> getAttendanceHistory(
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "0") int page,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "30") int size
    ) {
        Long userId = securityUtils.getCurrentUserId();
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        log.info("Fetching attendance history for user {} with page {} and size {}", userId, pageable.getPageNumber(), pageable.getPageSize());
        Page<AttendanceSessionDTO> history = presenceService.getAttendanceHistory(userId, pageable);
        PresenceHistoryResponse response = presenceApiMapper.toHistoryResponse(history, presenceProperties.getTimezone());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping({"/team/today", "/manager/team"})
    @PreAuthorize("hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<TeamStatusResponse>> getTeamStatus(
            @org.springframework.web.bind.annotation.RequestParam(required = false) Long teamId
    ) {
        Long managerId = securityUtils.getCurrentUserId();
        log.info("Fetching team today status for manager {} and team {}", managerId, teamId);
        return ResponseEntity.ok(ApiResponse.success(presenceService.getTeamTodayStatus(managerId, teamId)));
    }

    @GetMapping("/team/history")
    @PreAuthorize("hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Page<AttendanceSessionViewDTO>>> getTeamHistory(
            @org.springframework.web.bind.annotation.RequestParam(required = false) Long teamId,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "0") int page,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "30") int size
    ) {
        Long managerId = securityUtils.getCurrentUserId();
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        log.info("Fetching team history for manager {} and team {}", managerId, teamId);
        return ResponseEntity.ok(ApiResponse.success(presenceService.getTeamAttendanceHistory(managerId, teamId, pageable)));
    }

    @GetMapping("/company/today")
    @PreAuthorize("hasAnyAuthority('ROLE_RH','ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<TeamStatusResponse>> getCompanyToday() {
        Long rhUserId = securityUtils.getCurrentUserId();
        log.info("Fetching company today status for RH {}", rhUserId);
        return ResponseEntity.ok(ApiResponse.success(presenceService.getCompanyTodayStatus(rhUserId)));
    }

    @GetMapping("/global/today")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<TeamStatusResponse>> getGlobalToday() {
        Long adminId = securityUtils.getCurrentUserId();
        log.info("Fetching global today status for admin {}", adminId);
        return ResponseEntity.ok(ApiResponse.success(presenceService.getGlobalTodayStatus()));
    }

    @GetMapping("/company/stats")
    @PreAuthorize("hasAuthority('ROLE_RH')")
    public ResponseEntity<ApiResponse<PresenceStatsDTO>> getCompanyStats() {
        Long rhUserId = securityUtils.getCurrentUserId();
        log.info("Fetching company stats for RH {}", rhUserId);
        return ResponseEntity.ok(ApiResponse.success(presenceService.getCompanyStats(rhUserId)));
    }

    @GetMapping("/global/analytics")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<GlobalPresenceAnalyticsDTO>> getGlobalAnalytics() {
        Long adminId = securityUtils.getCurrentUserId();
        log.info("Fetching global presence analytics for admin {}", adminId);
        return ResponseEntity.ok(ApiResponse.success(presenceService.getGlobalAnalytics()));
    }

    @GetMapping({"/stats", "/me/stats"})
    @PreAuthorize("hasAuthority('ROLE_EMPLOYEE') or hasAuthority('ROLE_RH') or hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<PresenceStatsDTO>> getStats(Authentication authentication, HttpServletRequest request) {
        boolean explicitEmployeeView = request.getRequestURI().endsWith("/me/stats");
        boolean employeeOnly = authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_EMPLOYEE".equals(authority.getAuthority()))
                && authentication.getAuthorities().stream()
                .noneMatch(authority -> "ROLE_RH".equals(authority.getAuthority()) || "ROLE_ADMIN".equals(authority.getAuthority()));

        PresenceStatsDTO stats = (explicitEmployeeView || employeeOnly)
                ? presenceService.getMyStats(securityUtils.getCurrentUserId())
                : presenceService.getGlobalStats();

        return ResponseEntity.ok(ApiResponse.success(stats));
    }

    private TodayPresenceResponse buildPersonalTodayResponse(Long userId, AttendanceSummaryDTO summary) {
        PresenceStatsDTO myStats = presenceService.getMyStats(userId);
        return presenceApiMapper.toTodayResponse(summary, presenceProperties.getTimezone(), myStats);
    }
}
