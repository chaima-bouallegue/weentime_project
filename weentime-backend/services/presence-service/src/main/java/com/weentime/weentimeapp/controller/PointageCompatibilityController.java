package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.AttendanceSessionDTO;
import com.weentime.weentimeapp.dto.AttendanceSummaryDTO;
import com.weentime.weentimeapp.dto.CheckInRequest;
import com.weentime.weentimeapp.dto.CheckOutRequest;
import com.weentime.weentimeapp.dto.PresenceStatsDTO;
import com.weentime.weentimeapp.dto.TeamStatusResponse;
import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.PresenceSource;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.PresenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/v1/presences/pointages")
@RequiredArgsConstructor
public class PointageCompatibilityController {

    private final PresenceService presenceService;
    private final SecurityUtils securityUtils;

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> checkIn(@RequestBody(required = false) CheckInRequest request) {
        CheckInRequest safeRequest = request == null ? CheckInRequest.builder().source(PresenceSource.WEB).build() : request;
        if (safeRequest.getSource() == null) {
            safeRequest.setSource(PresenceSource.WEB);
        }

        AttendanceSummaryDTO summary = presenceService.checkIn(securityUtils.getCurrentUserId(), safeRequest);
        return ResponseEntity.ok(toStatusPayload(summary));
    }

    @PostMapping("/checkout")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> checkOut(@RequestBody(required = false) CheckOutRequest request) {
        AttendanceSummaryDTO summary = presenceService.checkOut(securityUtils.getCurrentUserId(), request);
        return ResponseEntity.ok(toStatusPayload(summary));
    }

    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getStatus() {
        return ResponseEntity.ok(toStatusPayload(presenceService.getTodayAttendance(securityUtils.getCurrentUserId())));
    }

    @GetMapping("/today")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Map<String, Object>>> getToday() {
        AttendanceSummaryDTO summary = presenceService.getTodayAttendance(securityUtils.getCurrentUserId());
        List<Map<String, Object>> payload = (summary.getSessions() == null ? List.<AttendanceSessionDTO>of() : summary.getSessions()).stream()
                .sorted(Comparator.comparing(AttendanceSessionDTO::getCheckInTime, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .map(this::toPointageEntry)
                .toList();
        return ResponseEntity.ok(payload);
    }

    @GetMapping("/enterprise/status-range")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<Map<LocalDate, TeamStatusResponse>> getStatusRange(
            @org.springframework.web.bind.annotation.RequestParam("entrepriseId") Long entrepriseId,
            @org.springframework.web.bind.annotation.RequestParam(value = "equipeId", required = false) Long equipeId,
            @org.springframework.web.bind.annotation.RequestParam("start") @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate start,
            @org.springframework.web.bind.annotation.RequestParam("end") @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate end) {
        return ResponseEntity.ok(presenceService.getStatusRange(entrepriseId, equipeId, start, end));
    }

    @GetMapping("/global/status-range")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Map<LocalDate, TeamStatusResponse>> getGlobalStatusRange(
            @org.springframework.web.bind.annotation.RequestParam("start") @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate start,
            @org.springframework.web.bind.annotation.RequestParam("end") @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate end) {
        return ResponseEntity.ok(presenceService.getStatusRange(null, null, start, end));
    }

    @GetMapping("/company/status-range")
    @PreAuthorize("hasAuthority('ROLE_RH')")
    public ResponseEntity<Map<LocalDate, TeamStatusResponse>> getCompanyStatusRange(
            @org.springframework.web.bind.annotation.RequestParam("start") @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate start,
            @org.springframework.web.bind.annotation.RequestParam("end") @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate end) {
        return ResponseEntity.ok(presenceService.getCompanyStatusRange(securityUtils.getCurrentUserId(), start, end));
    }

    @GetMapping("/team/status-range")
    @PreAuthorize("hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<Map<LocalDate, TeamStatusResponse>> getTeamStatusRange(
            @org.springframework.web.bind.annotation.RequestParam(value = "teamId", required = false) Long teamId,
            @org.springframework.web.bind.annotation.RequestParam("start") @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate start,
            @org.springframework.web.bind.annotation.RequestParam("end") @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate end) {
        return ResponseEntity.ok(presenceService.getTeamStatusRange(
                securityUtils.getCurrentUserId(),
                teamId,
                start,
                end
        ));
    }

    @GetMapping("/week")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getWeek() {
        Long userId = securityUtils.getCurrentUserId();
        AttendanceSummaryDTO todaySummary = presenceService.getTodayAttendance(userId);
        PresenceStatsDTO stats = presenceService.getMyStats(userId);
        List<AttendanceSessionDTO> weekSessions = presenceService.getAttendanceHistory(userId, PageRequest.of(0, 64)).getContent();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ponctualitePct", buildPunctuality(stats));
        payload.put("soldeConges", 0);
        payload.put("heuresAujourdhui", formatDuration(todaySummary.getTotalDuration()));
        payload.put("heuresSemaine", formatHours(stats.getTotalHoursThisWeek()));
        payload.put("minutesAujourdhui", secondsToMinutes(todaySummary.getTotalDuration()));
        payload.put("minutesSemaine", hoursToMinutes(stats.getTotalHoursThisWeek()));
        payload.put("joursParStatus", buildWeekStatuses(weekSessions, todaySummary, stats));
        return ResponseEntity.ok(payload);
    }

    private Map<String, Object> toStatusPayload(AttendanceSummaryDTO summary) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("checkedIn", Boolean.TRUE.equals(summary.getHasOpenSession()));
        payload.put("hasOpenSession", Boolean.TRUE.equals(summary.getHasOpenSession()));
        payload.put("status", summary.getStatus() != null ? summary.getStatus().name() : null);
        payload.put("utilisateurId", summary.getUtilisateurId());
        payload.put("heureEntree", formatDateTime(summary.getHeureEntree()));
        payload.put("heureSortie", formatDateTime(summary.getHeureSortie()));
        payload.put("checkInLocation", summary.getCheckInLocation());
        payload.put("checkOutLocation", summary.getCheckOutLocation());
        payload.put("duree", summary.getTotalDuration());
        payload.put("overtimeMode", summary.getOvertimeMode() != null ? summary.getOvertimeMode().name() : null);
        payload.put("showCheckoutAlert", Boolean.TRUE.equals(summary.getShowCheckoutAlert()));
        payload.put("overtimeStartedAt", formatDateTime(summary.getOvertimeStartedAt()));
        payload.put("overtimeMinutes", summary.getOvertimeMinutes());
        payload.put("overtimeLabel", summary.getOvertimeLabel());
        payload.put("activeSession", summary.getActiveSession() != null ? toPointageEntry(summary.getActiveSession()) : null);
        return payload;
    }

    private Map<String, Object> toPointageEntry(AttendanceSessionDTO session) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", session.getId());
        payload.put("utilisateurId", session.getUtilisateurId());
        payload.put("type", session.getCheckOutTime() == null ? "ENTREE" : "SORTIE");
        payload.put("timestamp", formatDateTime(session.getCheckOutTime() != null ? session.getCheckOutTime() : session.getCheckInTime()));
        payload.put("heureEntree", formatDateTime(session.getCheckInTime()));
        payload.put("heureSortie", formatDateTime(session.getCheckOutTime()));
        payload.put("checkInAddress", session.getCheckInAddress());
        payload.put("checkInLocation", session.getCheckInLocation());
        payload.put("checkOutAddress", session.getCheckOutAddress());
        payload.put("checkOutLocation", session.getCheckOutLocation());
        payload.put("latitude", session.getCheckOutTime() == null ? session.getCheckInLatitude() : session.getCheckOutLatitude());
        payload.put("longitude", session.getCheckOutTime() == null ? session.getCheckInLongitude() : session.getCheckOutLongitude());
        payload.put("accuracy", session.getCheckOutTime() == null ? session.getCheckInAccuracy() : session.getCheckOutAccuracy());
        payload.put("duree", session.getDuration());
        payload.put("dureeMinutes", secondsToMinutes(session.getDuration()));
        payload.put("estEnRetard", Boolean.TRUE.equals(session.getLateArrival()));
        payload.put("minutesRetard", Boolean.TRUE.equals(session.getLateArrival()) ? 1 : 0);
        payload.put("isAutoClosed", false);
        payload.put("overtimeMinutes", session.getOvertimeMinutes() == null ? 0 : session.getOvertimeMinutes());
        payload.put("overtimeMode", session.getOvertimeMode() != null ? session.getOvertimeMode().name() : null);
        payload.put("overtimeStartedAt", formatDateTime(session.getOvertimeStartedAt()));
        return payload;
    }

    private List<Map<String, Object>> buildWeekStatuses(
            List<AttendanceSessionDTO> weekSessions,
            AttendanceSummaryDTO todaySummary,
            PresenceStatsDTO stats
    ) {
        Map<LocalDate, AttendanceSessionDTO> firstSessionsByDate = new LinkedHashMap<>();
        for (AttendanceSessionDTO session : weekSessions) {
            if (session.getDate() == null) {
                continue;
            }
            AttendanceSessionDTO current = firstSessionsByDate.get(session.getDate());
            if (current == null || isBefore(session.getCheckInTime(), current.getCheckInTime())) {
                firstSessionsByDate.put(session.getDate(), session);
            }
        }

        if (todaySummary.getDate() != null && todaySummary.getSessions() != null && !todaySummary.getSessions().isEmpty()) {
            AttendanceSessionDTO firstTodaySession = todaySummary.getSessions().stream()
                    .filter(Objects::nonNull)
                    .min(Comparator.comparing(AttendanceSessionDTO::getCheckInTime, Comparator.nullsLast(Comparator.naturalOrder())))
                    .orElse(null);
            if (firstTodaySession != null) {
                firstSessionsByDate.put(todaySummary.getDate(), firstTodaySession);
            }
        }

        LocalDate start = stats.getDateFrom() != null ? stats.getDateFrom() : LocalDate.now().with(DayOfWeek.MONDAY);
        List<Map<String, Object>> result = new ArrayList<>();
        for (int index = 0; index < 7; index++) {
            LocalDate day = start.plusDays(index);
            AttendanceSessionDTO session = firstSessionsByDate.get(day);
            AttendanceDayStatus status = session != null ? session.getDailyStatus() : null;

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("jour", day.getDayOfWeek().name().substring(0, 3));
            payload.put("statut", mapDayStatus(status));
            payload.put("minutes", session != null ? secondsToMinutes(session.getDuration()) : 0);
            payload.put("objectifHeures", 8);
            result.add(payload);
        }
        return result;
    }

    private int buildPunctuality(PresenceStatsDTO stats) {
        long onTime = stats.getOnTimeArrivals();
        long late = stats.getLateArrivals();
        long total = onTime + late;
        if (total <= 0) {
            return 100;
        }
        return Math.toIntExact(Math.round((onTime * 100.0) / total));
    }

    private String mapDayStatus(AttendanceDayStatus status) {
        if (status == null) {
            return "OFF";
        }
        return switch (status) {
            case LATE -> "RETARD";
            case ABSENT -> "ABSENT";
            case HOLIDAY -> "OFF";
            case WORKING, IDLE, REMOTE, ON_LEAVE, PARTIAL, EARLY_LEAVE, AUTO_CLOSED, MISSING_CHECKOUT, OUT_OF_ZONE -> "OK";
        };
    }

    private boolean isBefore(LocalDateTime left, LocalDateTime right) {
        if (left == null) {
            return false;
        }
        if (right == null) {
            return true;
        }
        return left.isBefore(right);
    }

    private String formatDateTime(LocalDateTime value) {
        return value == null ? null : value.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }

    private String formatDuration(Long seconds) {
        long safeSeconds = seconds == null ? 0L : seconds;
        long hours = safeSeconds / 3600;
        long minutes = (safeSeconds % 3600) / 60;
        return String.format("%02dh %02dm", hours, minutes);
    }

    private String formatHours(BigDecimal hours) {
        BigDecimal safeHours = hours == null ? BigDecimal.ZERO : hours;
        long wholeHours = safeHours.longValue();
        long minutes = safeHours.subtract(BigDecimal.valueOf(wholeHours))
                .multiply(BigDecimal.valueOf(60))
                .setScale(0, RoundingMode.HALF_UP)
                .longValue();
        return String.format("%02dh %02dm", wholeHours, minutes);
    }

    private int secondsToMinutes(Long seconds) {
        return seconds == null ? 0 : Math.toIntExact(seconds / 60L);
    }

    private int hoursToMinutes(BigDecimal hours) {
        return hours == null ? 0 : hours.multiply(BigDecimal.valueOf(60)).setScale(0, RoundingMode.HALF_UP).intValue();
    }
}
