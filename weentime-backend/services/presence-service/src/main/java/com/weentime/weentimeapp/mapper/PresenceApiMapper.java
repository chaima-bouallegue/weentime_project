package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.AttendanceSessionDTO;
import com.weentime.weentimeapp.dto.AttendanceSummaryDTO;
import com.weentime.weentimeapp.dto.PresenceHistoryResponse;
import com.weentime.weentimeapp.dto.PresenceSessionResponse;
import com.weentime.weentimeapp.dto.PresenceStatsDTO;
import com.weentime.weentimeapp.dto.PointageLocationDTO;
import com.weentime.weentimeapp.dto.TodayPresenceResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Stream;

@Component
@RequiredArgsConstructor
public class PresenceApiMapper {

    private static final DateTimeFormatter OFFSET_DATE_TIME = DateTimeFormatter.ISO_OFFSET_DATE_TIME;
    private static final DateTimeFormatter DATE_ONLY = DateTimeFormatter.ISO_LOCAL_DATE;

    public TodayPresenceResponse toTodayResponse(AttendanceSummaryDTO summary, String timezone) {
        return toTodayResponse(summary, timezone, null);
    }

    public TodayPresenceResponse toTodayResponse(AttendanceSummaryDTO summary, String timezone, PresenceStatsDTO stats) {
        ZoneId zoneId = ZoneId.of(timezone);
        List<PresenceSessionResponse> sessions = summary.getSessions() == null
                ? List.of()
                : summary.getSessions().stream().map(session -> toSessionResponse(session, zoneId)).toList();

        PresenceSessionResponse activeSession = summary.getActiveSession() != null
                ? toSessionResponse(summary.getActiveSession(), zoneId)
                : null;

        String checkIn = formatDateTime(summary.getHeureEntree(), zoneId);
        String checkOut = formatDateTime(summary.getHeureSortie(), zoneId);
        long workedSeconds = summary.getTotalDuration() == null ? 0L : summary.getTotalDuration();

        return TodayPresenceResponse.builder()
                .state(resolveState(summary))
                .checkIn(checkIn)
                .checkOut(checkOut)
                .workedSeconds(workedSeconds)
                .todayActivities(sessions.size())
                .weekWorkedSeconds(resolveWeekWorkedSeconds(stats))
                .punctualityRate(resolvePunctualityRate(stats))
                .utilisateurId(summary.getUtilisateurId())
                .entrepriseId(summary.getEntrepriseId())
                .date(formatDate(summary.getDate()))
                .timezone(timezone)
                .status(summary.getStatus())
                .lateArrival(summary.getLateArrival())
                .hasOpenSession(summary.getHasOpenSession())
                .checkedIn(summary.getCheckedIn())
                .checkedOut(summary.getCheckedOut())
                .canCheckIn(summary.getCanCheckIn())
                .canCheckOut(summary.getCanCheckOut())
                .reasonIfBlocked(summary.getReasonIfBlocked())
                .totalDuration(workedSeconds)
                .currentSessionDuration(summary.getCurrentSessionDuration())
                .scheduledStart(summary.getScheduledStart())
                .scheduledEnd(summary.getScheduledEnd())
                .expectedMinutes(summary.getExpectedMinutes())
                .workedMinutes(summary.getWorkedMinutes())
                .overtimePreview(summary.getOvertimePreview())
                .overtimeMinutes(summary.getOvertimeMinutes())
                .overtimeMode(summary.getOvertimeMode())
                .overtimeConfirmed(summary.getOvertimeConfirmed())
                .showCheckoutAlert(summary.getShowCheckoutAlert())
                .overtimeStartedAt(formatDateTime(summary.getOvertimeStartedAt(), zoneId))
                .overtimeLabel(summary.getOvertimeLabel())
                .leaveOrHolidayInfo(summary.getLeaveOrHolidayInfo())
                .latestAlert(summary.getLatestAlert())
                .heureEntree(checkIn)
                .heureSortie(checkOut)
                .checkInLocation(summary.getCheckInLocationDetails())
                .checkInLocationLabel(summary.getCheckInLocation())
                .checkOutLocation(summary.getCheckOutLocationDetails())
                .checkOutLocationLabel(summary.getCheckOutLocation())
                .source(summary.getSource())
                .activeSession(activeSession)
                .sessions(sessions)
                .build();
    }

    public PresenceHistoryResponse toHistoryResponse(Page<AttendanceSessionDTO> page, String timezone) {
        ZoneId zoneId = ZoneId.of(timezone);
        List<PresenceSessionResponse> sessions = page.getContent().stream()
                .map(item -> toSessionResponse(item, zoneId))
                .toList();

        return PresenceHistoryResponse.builder()
                .timezone(timezone)
                .content(sessions)
                .page(page.getNumber())
                .size(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .empty(page.isEmpty())
                .build();
    }

    public PresenceSessionResponse toSessionResponse(AttendanceSessionDTO session, ZoneId zoneId) {
        if (session == null) {
            return null;
        }

        return PresenceSessionResponse.builder()
                .id(session.getId())
                .utilisateurId(session.getUtilisateurId())
                .entrepriseId(session.getEntrepriseId())
                .scheduleId(session.getScheduleId())
                .date(formatDate(session.getDate()))
                .checkInTime(formatDateTime(session.getCheckInTime(), zoneId))
                .checkOutTime(formatDateTime(session.getCheckOutTime(), zoneId))
                .duration(session.getDuration() == null ? 0L : session.getDuration())
                .status(session.getStatus())
                .source(session.getSource())
                .checkInSource(session.getCheckInSource())
                .checkOutSource(session.getCheckOutSource())
                .localisation(session.getLocalisation())
                .checkInLatitude(session.getCheckInLatitude())
                .checkInLongitude(session.getCheckInLongitude())
                .checkInAccuracy(session.getCheckInAccuracy())
                .checkInAddress(session.getCheckInAddress())
                .checkInCity(session.getCheckInCity())
                .checkInRegion(session.getCheckInRegion())
                .checkInCountry(session.getCheckInCountry())
                .checkInLocation(resolveLocationDetails(
                        session.getCheckInLocationDetails(),
                        session.getCheckInLatitude(),
                        session.getCheckInLongitude(),
                        session.getCheckInAccuracy(),
                        session.getCheckInAddress(),
                        session.getCheckInCity(),
                        session.getCheckInRegion(),
                        session.getCheckInCountry()
                ))
                .checkInLocationLabel(session.getCheckInLocation())
                .checkOutLatitude(session.getCheckOutLatitude())
                .checkOutLongitude(session.getCheckOutLongitude())
                .checkOutAccuracy(session.getCheckOutAccuracy())
                .checkOutAddress(session.getCheckOutAddress())
                .checkOutCity(session.getCheckOutCity())
                .checkOutRegion(session.getCheckOutRegion())
                .checkOutCountry(session.getCheckOutCountry())
                .checkOutLocation(resolveLocationDetails(
                        session.getCheckOutLocationDetails(),
                        session.getCheckOutLatitude(),
                        session.getCheckOutLongitude(),
                        session.getCheckOutAccuracy(),
                        session.getCheckOutAddress(),
                        session.getCheckOutCity(),
                        session.getCheckOutRegion(),
                        session.getCheckOutCountry()
                ))
                .checkOutLocationLabel(session.getCheckOutLocation())
                .lateArrival(session.getLateArrival())
                .dailyStatus(session.getDailyStatus())
                .workedMinutes(session.getWorkedMinutes())
                .expectedMinutes(session.getExpectedMinutes())
                .overtimeMinutes(session.getOvertimeMinutes())
                .overtimeMode(session.getOvertimeMode())
                .overtimeStartedAt(formatDateTime(session.getOvertimeStartedAt(), zoneId))
                .overtimeConfirmedAt(formatDateTime(session.getOvertimeConfirmedAt(), zoneId))
                .overtimeConfirmationShownAt(formatDateTime(session.getOvertimeConfirmationShownAt(), zoneId))
                .earlyLeaveMinutes(session.getEarlyLeaveMinutes())
                .autoClosed(session.getAutoClosed())
                .autoClosedReason(session.getAutoClosedReason())
                .latestAlert(session.getLatestAlert())
                .createdAt(formatDateTime(session.getCreatedAt(), zoneId))
                .build();
    }

    private PointageLocationDTO resolveLocationDetails(
            PointageLocationDTO existing,
            Double latitude,
            Double longitude,
            Double accuracy,
            String address,
            String city,
            String region,
            String country
    ) {
        if (existing != null) {
            return existing;
        }
        boolean hasCoordinates = latitude != null && longitude != null;
        boolean hasReadableDetails = Stream.of(address, city, region, country)
                .filter(value -> value != null)
                .anyMatch(value -> !value.isBlank());
        if (!hasCoordinates && !hasReadableDetails) {
            return null;
        }
        return PointageLocationDTO.builder()
                .latitude(latitude)
                .longitude(longitude)
                .accuracy(accuracy)
                .address(address)
                .city(city)
                .region(region)
                .country(country)
                .build();
    }

    private String resolveState(AttendanceSummaryDTO summary) {
        if (summary == null) {
            return "NOT_STARTED";
        }

        boolean hasActiveSession = summary.getHasOpenSession() == Boolean.TRUE
                || (summary.getActiveSession() != null
                && summary.getActiveSession().getCheckInTime() != null
                && summary.getActiveSession().getCheckOutTime() == null);

        if (hasActiveSession) {
            return "ACTIVE";
        }

        boolean hasClosedSession = summary.getSessions() != null && summary.getSessions().stream()
                .anyMatch(session -> session.getCheckInTime() != null && session.getCheckOutTime() != null);
        if (hasClosedSession) {
            return "CLOSED";
        }

        return "NOT_STARTED";
    }

    private String formatDate(LocalDate value) {
        if (value == null) {
            return null;
        }
        return value.format(DATE_ONLY);
    }

    private String formatDateTime(LocalDateTime value, ZoneId zoneId) {
        if (value == null) {
            return null;
        }
        return value.atZone(zoneId).toOffsetDateTime().format(OFFSET_DATE_TIME);
    }

    private long resolveWeekWorkedSeconds(PresenceStatsDTO stats) {
        if (stats == null) {
            return 0L;
        }
        BigDecimal weeklyHours = stats.getTotalHoursThisWeek() != null
                ? stats.getTotalHoursThisWeek()
                : stats.getTotalHoursWorked();
        if (weeklyHours == null) {
            return 0L;
        }
        return weeklyHours.multiply(BigDecimal.valueOf(3600L))
                .setScale(0, RoundingMode.HALF_UP)
                .longValue();
    }

    private int resolvePunctualityRate(PresenceStatsDTO stats) {
        if (stats == null) {
            return 100;
        }
        long onTime = Math.max(stats.getOnTimeCount(), stats.getOnTimeArrivals());
        long late = Math.max(stats.getLateCount(), stats.getLateArrivals());
        long total = onTime + late;
        if (total <= 0L) {
            return 100;
        }
        return Math.toIntExact(Math.round((onTime * 100.0d) / total));
    }
}
