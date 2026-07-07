package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.RhServiceFeignClientWrapper;
import com.weentime.weentimeapp.client.UserServiceClient;
import com.weentime.weentimeapp.config.PresenceProperties;
import com.weentime.weentimeapp.dto.AttendanceSessionDTO;
import com.weentime.weentimeapp.dto.AttendanceSessionViewDTO;
import com.weentime.weentimeapp.dto.AttendanceSummaryDTO;
import com.weentime.weentimeapp.dto.CheckInRequest;
import com.weentime.weentimeapp.dto.CheckOutRequest;
import com.weentime.weentimeapp.dto.DailyAttendanceStatusDTO;
import com.weentime.weentimeapp.dto.GlobalPresenceAnalyticsDTO;
import com.weentime.weentimeapp.dto.PointageLocationDTO;
import com.weentime.weentimeapp.dto.PresenceNotificationDTO;
import com.weentime.weentimeapp.dto.PresenceStatsDTO;
import com.weentime.weentimeapp.dto.TeamStatusResponse;
import com.weentime.weentimeapp.dto.UserSummaryDTO;
import com.weentime.weentimeapp.entity.AttendanceSession;
import com.weentime.weentimeapp.entity.Overtime;
import com.weentime.weentimeapp.entity.WorkSchedule;
import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.AttendanceSessionStatus;
import com.weentime.weentimeapp.enums.OvertimeMode;
import com.weentime.weentimeapp.enums.OvertimeStatus;
import com.weentime.weentimeapp.enums.PresenceSource;
import com.weentime.weentimeapp.enums.PresenceStatus;
import com.weentime.weentimeapp.exception.PresenceBusinessException;
import com.weentime.weentimeapp.mapper.AttendanceSessionMapper;
import com.weentime.weentimeapp.repository.AttendanceSessionRepository;
import com.weentime.weentimeapp.repository.OvertimeRepository;
import com.weentime.weentimeapp.repository.WorkScheduleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.HashSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
@Slf4j
public class PresenceServiceImpl implements PresenceService {

    private final AttendanceSessionRepository attendanceSessionRepository;
    private final WorkScheduleRepository workScheduleRepository;
    private final OvertimeRepository overtimeRepository;
    private final AttendanceSessionMapper attendanceSessionMapper;
    private final RhServiceFeignClientWrapper rhServiceFeignClientWrapper;
    private final UserServiceClient userServiceClient;
    private final NotificationService notificationService;
    private final PresenceProperties presenceProperties;
    private final HoraireManagementService horaireManagementService;
    private final LocationResolverService locationResolverService;

    // --- Manual Thread-Safe Cache with 15s TTL ---
    private static class CacheEntry<T> {
        final T value;
        final long timestamp;
        CacheEntry(T value) {
            this.value = value;
            this.timestamp = System.currentTimeMillis();
        }
        boolean isExpired(long ttlMs) {
            return System.currentTimeMillis() - timestamp > ttlMs;
        }
    }

    private final java.util.Map<String, CacheEntry<Boolean>> leaveCache = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.Map<String, CacheEntry<Boolean>> teleworkCache = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.Map<String, CacheEntry<Boolean>> holidayCache = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.Map<Long, CacheEntry<UserSummaryDTO>> userCache = new java.util.concurrent.ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 15000L; // 15s TTL

    private Clock clock = Clock.systemUTC();

    /**
     * Allows tests to inject a fixed clock for deterministic time.
     */
    void setClock(Clock clock) {
        this.clock = clock == null ? Clock.systemUTC() : clock;
    }

    @Override
    @Transactional
    public AttendanceSummaryDTO checkIn(Long utilisateurId, CheckInRequest request) {
        if (utilisateurId == null) {
            throw new IllegalStateException("Authenticated user not found");
        }
        CheckInRequest safeRequest = request == null
                ? CheckInRequest.builder().source(PresenceSource.WEB).build()
                : request;
        if (safeRequest.getSource() == null) {
            safeRequest.setSource(PresenceSource.WEB);
        }

        LocalDate today = currentDate();
        log.info("Starting check-in for user {} on {}", utilisateurId, today);
        UserSummaryDTO currentUser = requireUserWithEnterprise(utilisateurId);
        validateGps("check-in", safeRequest.getLatitude(), safeRequest.getLongitude(), safeRequest.getAccuracy());
        LocationResolverService.ResolvedLocation checkInLocation = resolveLocationForStorage(
                safeRequest.getLatitude(),
                safeRequest.getLongitude(),
                safeRequest.getAccuracy(),
                safeRequest.getAddress()
        );

        List<AttendanceSession> openSessions = attendanceSessionRepository
                .findByUtilisateurIdAndStatusOrderByCheckInTimeDesc(utilisateurId, AttendanceSessionStatus.OPEN);

        Optional<AttendanceSession> todayOpenSession = openSessions.stream()
                .filter(session -> Objects.equals(resolveSessionDate(session, today), today))
                .findFirst();
        if (todayOpenSession.isPresent()) {
            throw new PresenceBusinessException(
                    HttpStatus.CONFLICT,
                    "ATTENDANCE_ALREADY_CHECKED_IN",
                    "Vous avez deja pointe votre entree aujourd'hui."
            );
        }

        closeStaleOpenSessions(utilisateurId, today, openSessions);

        List<AttendanceSession> todaySessions = attendanceSessionRepository
                .findByUtilisateurIdAndDateOrderByCheckInTimeAsc(utilisateurId, today);
        if (!todaySessions.isEmpty()) {
            throw new PresenceBusinessException(
                    HttpStatus.CONFLICT,
                    "ATTENDANCE_ALREADY_CHECKED_IN",
                    "Vous avez deja pointe votre entree aujourd'hui."
            );
        }

        if (hasApprovedLeave(utilisateurId, today)) {
            log.warn("Check-in rejected for user {} because an approved leave exists on {}", utilisateurId, today);
            throw new PresenceBusinessException(
                    HttpStatus.CONFLICT,
                    "ATTENDANCE_ON_LEAVE_FORBIDDEN",
                    "Vous ne pouvez pas pointer aujourd'hui car vous etes en conge approuve."
            );
        }

        if (isPublicHoliday(currentUser.getEntrepriseId(), today)
                && !presenceProperties.isPublicHolidayExceptionalWorkAllowed()) {
            throw new PresenceBusinessException(
                    HttpStatus.CONFLICT,
                    "ATTENDANCE_ON_HOLIDAY_FORBIDDEN",
                    "Vous ne pouvez pas pointer aujourd'hui car c'est un jour ferie."
            );
        }

        WorkSchedule schedule = resolveSchedule(utilisateurId, today);
        LocalDateTime now = currentDateTime();
        boolean lateArrival = todaySessions.isEmpty() && isLateArrival(schedule, now, today);
        boolean outOfScheduleCheckIn = isCheckInAfterScheduledEnd(schedule, now, today);
        Integer expectedMinutes = expectedMinutes(schedule, today);

        AttendanceSession session = AttendanceSession.builder()
                .utilisateurId(utilisateurId)
                .entrepriseId(currentUser.getEntrepriseId())
                .scheduleId(schedule != null ? schedule.getId() : null)
                .date(today)
                .checkInTime(now)
                .duration(0L)
                .status(AttendanceSessionStatus.OPEN)
                .source(safeRequest.getSource())
                .checkInSource(safeRequest.getSource())
                .localisation(safeRequest.getLocalisation())
                .checkInLatitude(safeRequest.getLatitude())
                .checkInLongitude(safeRequest.getLongitude())
                .checkInAccuracy(safeRequest.getAccuracy())
                .checkInAddress(checkInLocation.address())
                .checkInCity(checkInLocation.city())
                .checkInRegion(checkInLocation.region())
                .checkInCountry(checkInLocation.country())
                .lateArrival(lateArrival)
                .dailyStatus((lateArrival || outOfScheduleCheckIn) ? AttendanceDayStatus.LATE : AttendanceDayStatus.WORKING)
                .workedMinutes(0)
                .expectedMinutes(expectedMinutes)
                .overtimeMinutes(0)
                .overtimeMode(OvertimeMode.NONE)
                .earlyLeaveMinutes(0)
                .autoClosed(Boolean.FALSE)
                .latestAlert(outOfScheduleCheckIn ? "Pointage hors horaire detecte" : null)
                .build();

        AttendanceSession savedSession = attendanceSessionRepository.saveAndFlush(session);
        log.info(
                "Check-in persisted for user {} with session {} at {}",
                utilisateurId,
                savedSession.getId(),
                savedSession.getCheckInTime()
        );

        // Geocodage async si la ville n'est pas encore resolue
        if (savedSession.getCheckInCity() == null && safeRequest.getLatitude() != null) {
            locationResolverService.resolveCheckInAddressAsync(
                    savedSession.getId(),
                    safeRequest.getLatitude(),
                    safeRequest.getLongitude(),
                    safeRequest.getAddress());
        }

        maybeNotifyLateArrival(utilisateurId, savedSession, lateArrival);

        List<AttendanceSession> updatedSessions = new ArrayList<>(todaySessions);
        updatedSessions.add(savedSession);
        updatedSessions.sort(Comparator.comparing(AttendanceSession::getCheckInTime));

        return buildTodaySummary(utilisateurId, today, updatedSessions);
    }

    @Override
    @Transactional
    public AttendanceSummaryDTO checkOut(Long utilisateurId, CheckOutRequest request) {
        if (utilisateurId == null) {
            throw new IllegalStateException("Authenticated user not found");
        }
        CheckOutRequest safeRequest = request == null ? CheckOutRequest.builder().build() : request;
        log.info("Starting check-out for user {}", utilisateurId);
        UserSummaryDTO currentUser = requireUserWithEnterprise(utilisateurId);
        validateGps("check-out", safeRequest.getLatitude(), safeRequest.getLongitude(), safeRequest.getAccuracy());
        LocationResolverService.ResolvedLocation checkOutLocation = resolveLocationForStorage(
                safeRequest.getLatitude(),
                safeRequest.getLongitude(),
                safeRequest.getAccuracy(),
                safeRequest.getAddress()
        );
        LocalDate today = currentDate();

        AttendanceSession openSession = attendanceSessionRepository
                .findFirstByUtilisateurIdAndDateAndStatusOrderByCheckInTimeDesc(utilisateurId, today, AttendanceSessionStatus.OPEN)
                .orElseThrow(() -> {
                    if (attendanceSessionRepository.existsByUtilisateurIdAndDateAndCheckOutTimeIsNotNull(utilisateurId, today)) {
                        return new PresenceBusinessException(
                                HttpStatus.CONFLICT,
                                "ATTENDANCE_ALREADY_CHECKED_OUT",
                                "Vous avez deja pointe votre sortie aujourd'hui."
                        );
                    }
                    log.warn("Check-out rejected for user {} because no open session exists today", utilisateurId);
                    return new PresenceBusinessException(
                            HttpStatus.CONFLICT,
                            "ATTENDANCE_SESSION_NOT_OPEN",
                            "Vous devez pointer votre entree avant de pointer votre sortie."
                    );
                });

        LocalDateTime now = currentDateTime();
        WorkSchedule schedule = resolveSchedule(utilisateurId, openSession.getDate());
        long duration = Duration.between(openSession.getCheckInTime(), now).getSeconds();
        if (duration < 0) {
            throw new IllegalArgumentException("Checkout time cannot be earlier than check-in time.");
        }
        int workedMinutes = Math.toIntExact(duration / 60L);
        int expectedMinutes = expectedMinutes(schedule, openSession.getDate());
        int earlyLeaveMinutes = earlyLeaveMinutes(schedule, openSession.getDate(), now);
        OvertimeMode previousOvertimeMode = normalizeOvertimeMode(openSession.getOvertimeMode());
        int overtimeMinutes = previousOvertimeMode == OvertimeMode.ACTIVE
                ? confirmedOvertimeMinutes(openSession, now)
                : 0;
        LocalDateTime overtimeStart = previousOvertimeMode == OvertimeMode.ACTIVE
                ? resolveConfirmedOvertimeStart(openSession, now)
                : null;

        // Resolve actual overtime minutes based on the overtime mode.
        // If the user was in ACTIVE overtime mode, compute from overtimeStartedAt.
        // If the user was in WAITING_CONFIRMATION (declined overtime), zero out.
        int resolvedOvertimeMinutes;
        if (openSession.getOvertimeMode() == OvertimeMode.ACTIVE
                && openSession.getOvertimeStartedAt() != null) {
            resolvedOvertimeMinutes = Math.toIntExact(
                    Math.max(Duration.between(openSession.getOvertimeStartedAt(), now).toMinutes(), 0L));
        } else if (openSession.getOvertimeMode() == OvertimeMode.WAITING_CONFIRMATION) {
            resolvedOvertimeMinutes = 0;
        } else {
            resolvedOvertimeMinutes = overtimeMinutes;
        }

        openSession.setCheckOutTime(now);
        openSession.setDuration(duration);
        if (openSession.getLocalisation() == null) {
            openSession.setLocalisation(safeRequest.getLocalisation());
        }
        openSession.setCheckOutSource(safeRequest.getSource() != null ? safeRequest.getSource() : PresenceSource.WEB);
        openSession.setCheckOutLatitude(safeRequest.getLatitude());
        openSession.setCheckOutLongitude(safeRequest.getLongitude());
        openSession.setCheckOutAccuracy(safeRequest.getAccuracy());
        openSession.setCheckOutAddress(checkOutLocation.address());
        openSession.setCheckOutCity(checkOutLocation.city());
        openSession.setCheckOutRegion(checkOutLocation.region());
        openSession.setCheckOutCountry(checkOutLocation.country());
        openSession.setEntrepriseId(openSession.getEntrepriseId() != null ? openSession.getEntrepriseId() : currentUser.getEntrepriseId());
        openSession.setScheduleId(openSession.getScheduleId() != null || schedule == null ? openSession.getScheduleId() : schedule.getId());
        openSession.setWorkedMinutes(workedMinutes);
        openSession.setExpectedMinutes(expectedMinutes);
        openSession.setOvertimeMinutes(resolvedOvertimeMinutes);
        openSession.setOvertimeMode(OvertimeMode.FINISHED);
        if (previousOvertimeMode == OvertimeMode.ACTIVE) {
            openSession.setOvertimeStartedAt(overtimeStart);
            if (openSession.getOvertimeConfirmedAt() == null) {
                openSession.setOvertimeConfirmedAt(overtimeStart);
            }
        }
        openSession.setEarlyLeaveMinutes(earlyLeaveMinutes);
        openSession.setStatus(AttendanceSessionStatus.CLOSED);
        openSession.setDailyStatus(resolveClosedDailyStatus(openSession, earlyLeaveMinutes));

        attendanceSessionRepository.saveAndFlush(openSession);
        log.info(
                "Check-out persisted for user {} with session {} at {} after {} seconds",
                utilisateurId,
                openSession.getId(),
                openSession.getCheckOutTime(),
                duration
        );

        // Géocodage async si la ville n'est pas encore résolue
        if (openSession.getCheckOutCity() == null && safeRequest.getLatitude() != null) {
            locationResolverService.resolveCheckOutAddressAsync(
                    openSession.getId(),
                    safeRequest.getLatitude(),
                    safeRequest.getLongitude(),
                    safeRequest.getAddress());
        }

        refreshOvertime(utilisateurId, openSession.getDate());

        return buildTodaySummary(
                utilisateurId,
                openSession.getDate(),
                attendanceSessionRepository.findByUtilisateurIdAndDateOrderByCheckInTimeAsc(utilisateurId, openSession.getDate())
        );
    }

    @Override
    @Transactional
    public AttendanceSummaryDTO continueOvertime(Long utilisateurId) {
        if (utilisateurId == null) {
            throw new IllegalStateException("Authenticated user not found");
        }

        LocalDate today = currentDate();
        AttendanceSession openSession = attendanceSessionRepository
                .findFirstByUtilisateurIdAndDateAndStatusOrderByCheckInTimeDesc(utilisateurId, today, AttendanceSessionStatus.OPEN)
                .orElseThrow(() -> new PresenceBusinessException(
                        HttpStatus.CONFLICT,
                        "ATTENDANCE_SESSION_NOT_OPEN",
                        "Vous devez pointer votre entree avant de continuer en heures supplementaires."
                ));

        if (openSession.getCheckOutTime() != null) {
            throw new PresenceBusinessException(
                    HttpStatus.CONFLICT,
                    "ATTENDANCE_ALREADY_CHECKED_OUT",
                    "Votre journee est deja cloturee."
            );
        }

        WorkSchedule schedule = resolveSchedule(utilisateurId, today);
        LocalDateTime scheduledEnd = scheduledEndDateTime(schedule, today);
        if (scheduledEnd == null) {
            throw new PresenceBusinessException(
                    HttpStatus.CONFLICT,
                    "OVERTIME_SCHEDULE_END_REQUIRED",
                    "Aucun horaire de fin n'est configure pour activer les heures supplementaires."
            );
        }

        LocalDateTime now = currentDateTime();
        if (openSession.getCheckInTime() == null || !openSession.getCheckInTime().isBefore(scheduledEnd)) {
            openSession.setLatestAlert("Pointage hors horaire detecte");
            attendanceSessionRepository.save(openSession);
            throw new PresenceBusinessException(
                    HttpStatus.CONFLICT,
                    "OVERTIME_OUT_OF_SCHEDULE_CHECK_IN",
                    "Ce pointage hors horaire n'ouvre pas automatiquement droit aux heures supplementaires."
            );
        }
        if (now.isBefore(scheduledEnd)) {
            throw new PresenceBusinessException(
                    HttpStatus.CONFLICT,
                    "OVERTIME_NOT_STARTED",
                    "Les heures supplementaires ne peuvent commencer qu'apres la fin de l'horaire prevu."
            );
        }

        OvertimeMode currentMode = normalizeOvertimeMode(openSession.getOvertimeMode());
        if (currentMode != OvertimeMode.ACTIVE) {
            openSession.setOvertimeMode(OvertimeMode.ACTIVE);
            openSession.setOvertimeStartedAt(scheduledEnd);
            openSession.setOvertimeConfirmedAt(now);
            if (openSession.getOvertimeConfirmationShownAt() == null) {
                openSession.setOvertimeConfirmationShownAt(now);
            }
            attendanceSessionRepository.saveAndFlush(openSession);
        }

        return buildTodaySummary(
                utilisateurId,
                openSession.getDate(),
                attendanceSessionRepository.findByUtilisateurIdAndDateOrderByCheckInTimeAsc(utilisateurId, openSession.getDate())
        );
    }

    @Override
    public AttendanceSummaryDTO getTodayAttendance(Long utilisateurId) {
        if (utilisateurId == null) {
            return AttendanceSummaryDTO.builder()
                    .utilisateurId(null)
                    .date(currentDate())
                    .status(AttendanceDayStatus.ABSENT)
                    .sessions(List.of())
                    .build();
        }

        LocalDate today = currentDate();
        log.info("Fetching today attendance for user {} on {}", utilisateurId, today);
        return buildTodaySummary(
                utilisateurId,
                today,
                attendanceSessionRepository.findByUtilisateurIdAndDateOrderByCheckInTimeAsc(utilisateurId, today)
        );
    }

    @Override
    public Page<AttendanceSessionDTO> getAttendanceHistory(Long utilisateurId, Pageable pageable) {
        if (utilisateurId == null) {
            throw new IllegalStateException("Authenticated user not found");
        }

        Pageable safePageable = pageable == null
                ? org.springframework.data.domain.PageRequest.of(0, 30)
                : org.springframework.data.domain.PageRequest.of(
                        Math.max(pageable.getPageNumber(), 0),
                        Math.min(Math.max(pageable.getPageSize(), 1), 100),
                        pageable.getSort().isSorted() ? pageable.getSort() : org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "checkInTime")
                );

        log.info("Fetching attendance history for user {} with page {} and size {}", utilisateurId, safePageable.getPageNumber(), safePageable.getPageSize());
        return attendanceSessionRepository.findByUtilisateurIdOrderByCheckInTimeDesc(utilisateurId, safePageable)
                .map(this::toSessionDto);
    }

    @Override
    public TeamStatusResponse getTeamTodayStatus(Long managerId, Long teamId) {
        if (managerId == null) {
            throw new IllegalStateException("Authenticated manager not found");
        }

        log.info("Fetching team for manager {} and team {}", managerId, teamId);

        if (!managerExists(managerId)) {
            log.warn("Manager {} could not be resolved in organisation-service. Returning empty team.", managerId);
            return emptyOverview("TEAM", teamId, null);
        }

        List<UserSummaryDTO> members = filterUsersByTeam(fetchTeamMembers(managerId), teamId);
        if (members.isEmpty()) {
            log.info("No team found for manager {}", managerId);
            return emptyOverview("TEAM", teamId, null);
        }

        return buildOverview("TEAM", teamId, members);
    }

    @Override
    public Page<AttendanceSessionViewDTO> getTeamAttendanceHistory(Long managerId, Long teamId, Pageable pageable) {
        if (managerId == null) {
            throw new IllegalStateException("Authenticated manager not found");
        }

        List<UserSummaryDTO> members = filterUsersByTeam(fetchTeamMembers(managerId), teamId);
        return buildScopedHistory(members, pageable);
    }

    @Override
    public TeamStatusResponse getCompanyTodayStatus(Long rhUserId) {
        if (rhUserId == null) {
            throw new IllegalStateException("Authenticated RH user not found");
        }

        UserSummaryDTO currentUser = fetchUserSummary(rhUserId);
        Long entrepriseId = currentUser != null ? currentUser.getEntrepriseId() : null;
        if (entrepriseId == null) {
            log.warn("RH user {} has no entrepriseId in organisation-service", rhUserId);
            return emptyOverview("COMPANY", null, null);
        }

        List<UserSummaryDTO> companyUsers = filterUsersByEntreprise(fetchActiveUsers(), entrepriseId);
        return buildOverview("COMPANY", null, companyUsers);
    }

    @Override
    public TeamStatusResponse getGlobalTodayStatus() {
        TeamStatusResponse overview = buildOverview("GLOBAL", null, fetchActiveUsers());
        overview.setEntrepriseId(null);
        return overview;
    }

    @Override
    public PresenceStatsDTO getCompanyStats(Long rhUserId) {
        if (rhUserId == null) {
            throw new IllegalStateException("Authenticated RH user not found");
        }

        UserSummaryDTO currentUser = fetchUserSummary(rhUserId);
        Long entrepriseId = currentUser != null ? currentUser.getEntrepriseId() : null;
        if (entrepriseId == null) {
            return emptyStats(currentDate(), currentDate());
        }

        return buildStatsForUsers(filterUsersByEntreprise(fetchActiveUsers(), entrepriseId), currentDate(), currentDate());
    }

    @Override
    public GlobalPresenceAnalyticsDTO getGlobalAnalytics() {
        LocalDate today = currentDate();
        List<UserSummaryDTO> activeUsers = fetchActiveUsers();
        if (activeUsers.isEmpty()) {
            return GlobalPresenceAnalyticsDTO.builder()
                    .date(today)
                    .generatedAt(currentDateTime())
                    .totalTrackedUsers(0)
                    .presentToday(0)
                    .absentToday(0)
                    .lateToday(0)
                    .openSessions(0)
                    .closedSessions(0)
                    .totalHoursWorkedToday(BigDecimal.ZERO)
                    .averageSessionHours(BigDecimal.ZERO)
                    .companyDistribution(Map.of())
                    .departmentDistribution(Map.of())
                    .build();
        }

        List<Long> userIds = activeUsers.stream().map(UserSummaryDTO::getId).filter(Objects::nonNull).toList();
        List<AttendanceSession> todaySessions = attendanceSessionRepository.findByUtilisateurIdInAndDate(userIds, today);
        Map<Long, List<AttendanceSession>> sessionsByUser = todaySessions.stream()
                .collect(Collectors.groupingBy(AttendanceSession::getUtilisateurId));

        long presentToday = 0;
        long absentToday = 0;
        long lateToday = 0;
        long openSessions = todaySessions.stream().filter(session -> session.getStatus() == AttendanceSessionStatus.OPEN).count();
        long closedSessions = todaySessions.stream().filter(session -> session.getStatus() == AttendanceSessionStatus.CLOSED).count();
        long workedSeconds = 0;

        List<AttendanceSummaryDTO> summaries = activeUsers.parallelStream()
                .map(user -> buildTodaySummary(user.getId(), today, sessionsByUser.getOrDefault(user.getId(), List.of()), user, null, null, null))
                .toList();

        for (AttendanceSummaryDTO summary : summaries) {
            if (summary.getStatus() == AttendanceDayStatus.ABSENT) {
                absentToday++;
            } else {
                presentToday++;
                if (summary.getStatus() == AttendanceDayStatus.LATE) {
                    lateToday++;
                }
            }
            workedSeconds += summary.getTotalDuration() != null ? summary.getTotalDuration() : 0L;
        }

        long sessionCount = Math.max(closedSessions + openSessions, 1L);
        return GlobalPresenceAnalyticsDTO.builder()
                .date(today)
                .generatedAt(currentDateTime())
                .totalTrackedUsers(activeUsers.size())
                .presentToday(presentToday)
                .absentToday(absentToday)
                .lateToday(lateToday)
                .openSessions(openSessions)
                .closedSessions(closedSessions)
                .totalHoursWorkedToday(toHours(workedSeconds))
                .averageSessionHours(toHours(workedSeconds).divide(BigDecimal.valueOf(sessionCount), 2, RoundingMode.HALF_UP))
                .companyDistribution(groupUsersBy(activeUsers, UserSummaryDTO::getEntreprise))
                .departmentDistribution(groupUsersBy(activeUsers, UserSummaryDTO::getDepartement))
                .build();
    }

    @Override
    public PresenceStatsDTO getGlobalStats() {
        LocalDate today = currentDate();
        List<UserSummaryDTO> activeUsers = fetchActiveUsers();
        if (activeUsers.isEmpty()) {
            log.info("No active users available for presence stats on {}", today);
            return emptyStats(today, today);
        }
        return buildStatsForUsers(activeUsers, today, today);
    }

    @Override
    public PresenceStatsDTO getMyStats(Long utilisateurId) {
        if (utilisateurId == null) {
            return emptyStats(currentDate(), currentDate());
        }

        LocalDate weekStart = currentDate().minusDays(currentDate().getDayOfWeek().getValue() - 1L);
        LocalDate weekEnd = weekStart.plusDays(6);
        Map<LocalDate, List<AttendanceSession>> sessionsByDate = attendanceSessionRepository
                .findByUtilisateurIdAndDateBetweenOrderByDateDesc(utilisateurId, weekStart, weekEnd)
                .stream()
                .collect(Collectors.groupingBy(AttendanceSession::getDate));

        long totalPresent = 0;
        long totalAbsent = 0;
        long lateCount = 0;
        long workedSeconds = 0;
        long onTimeCount = 0;
        long arrivalSecondsTotal = 0;
        int arrivalDays = 0;
        List<DailyAttendanceStatusDTO> dailyStatuses = new ArrayList<>();

        for (LocalDate date = weekStart; !date.isAfter(weekEnd); date = date.plusDays(1)) {
            WorkSchedule schedule = resolveSchedule(utilisateurId, date);
            boolean workingDay = isWorkingDay(schedule, date);
            if (!workingDay) {
                dailyStatuses.add(DailyAttendanceStatusDTO.builder()
                        .date(date)
                        .status(AttendanceDayStatus.IDLE)
                        .workedSeconds(0L)
                        .workingDay(Boolean.FALSE)
                        .build());
                continue;
            }

            List<AttendanceSession> sessions = sessionsByDate.getOrDefault(date, List.of());
            if (!sessions.isEmpty()) {
                AttendanceSummaryDTO daySummary = buildTodaySummary(utilisateurId, date, sessions, null, null, null, null);
                totalPresent++;
                AttendanceSession firstSession = sessions.stream()
                        .filter(session -> session.getCheckInTime() != null)
                        .min(Comparator.comparing(AttendanceSession::getCheckInTime))
                        .orElse(null);
                if (firstSession != null && firstSession.getCheckInTime() != null) {
                    arrivalSecondsTotal += firstSession.getCheckInTime().toLocalTime().toSecondOfDay();
                    arrivalDays++;
                    if (Boolean.TRUE.equals(firstSession.getLateArrival())) {
                        lateCount++;
                    } else {
                        onTimeCount++;
                    }
                }
                long workedForDay = daySummary.getTotalDuration() != null ? daySummary.getTotalDuration() : 0L;
                workedSeconds += workedForDay;
                dailyStatuses.add(DailyAttendanceStatusDTO.builder()
                        .date(date)
                        .status(daySummary.getStatus())
                        .workedSeconds(workedForDay)
                        .workingDay(Boolean.TRUE)
                        .build());
                continue;
            }

            if (hasApprovedLeave(utilisateurId, date)) {
                dailyStatuses.add(DailyAttendanceStatusDTO.builder()
                        .date(date)
                        .status(AttendanceDayStatus.ON_LEAVE)
                        .workedSeconds(0L)
                        .workingDay(Boolean.TRUE)
                        .build());
                continue;
            }

            if (hasApprovedTelework(utilisateurId, date)) {
                totalPresent++;
                onTimeCount++;
                dailyStatuses.add(DailyAttendanceStatusDTO.builder()
                        .date(date)
                        .status(AttendanceDayStatus.REMOTE)
                        .workedSeconds(0L)
                        .workingDay(Boolean.TRUE)
                        .build());
                continue;
            }

            totalAbsent++;
            dailyStatuses.add(DailyAttendanceStatusDTO.builder()
                    .date(date)
                    .status(AttendanceDayStatus.ABSENT)
                    .workedSeconds(0L)
                    .workingDay(Boolean.TRUE)
                    .build());
        }

        BigDecimal totalHours = toHours(workedSeconds);
        return PresenceStatsDTO.builder()
                .dateFrom(weekStart)
                .dateTo(weekEnd)
                .totalPresent(totalPresent)
                .totalAbsent(totalAbsent)
                .lateCount(lateCount)
                .totalHoursThisWeek(totalHours)
                .totalHoursWorked(totalHours)
                .averageArrivalTime(arrivalDays == 0 ? "--:--" : formatAverageArrival(arrivalSecondsTotal / arrivalDays))
                .onTimeCount(onTimeCount)
                .overtimeHours(Optional.ofNullable(overtimeRepository.sumHeuresSupplementairesByUtilisateurIdAndDateBetween(utilisateurId, weekStart, weekEnd))
                        .orElse(BigDecimal.ZERO))
                .onTimeArrivals(onTimeCount)
                .lateArrivals(lateCount)
                .dailyStatuses(dailyStatuses)
                .build();
    }

    @Override
    public void detectAbsences() {
        List<UserSummaryDTO> activeUsers = fetchActiveUsers();
        if (activeUsers.isEmpty()) {
            log.info("Skipping absence detection because no active users could be resolved.");
            return;
        }

        LocalDate today = currentDate();
        List<Long> userIds = activeUsers.stream()
                .map(UserSummaryDTO::getId)
                .filter(Objects::nonNull)
                .toList();
        Map<Long, List<AttendanceSession>> sessionsByUser = attendanceSessionRepository
                .findByUtilisateurIdInAndDate(userIds, today)
                .stream()
                .collect(Collectors.groupingBy(AttendanceSession::getUtilisateurId));

        List<UserSummaryDTO> absentUsers = activeUsers.parallelStream()
                .filter(user -> buildTodaySummary(
                        user.getId(),
                        today,
                        sessionsByUser.getOrDefault(user.getId(), List.of()),
                        user,
                        null,
                        null,
                        null
                ).getStatus() == AttendanceDayStatus.ABSENT)
                .toList();

        if (!absentUsers.isEmpty()) {
            absentUsers.stream()
                    .filter(user -> user.getManagerId() != null)
                    .collect(Collectors.groupingBy(UserSummaryDTO::getManagerId, LinkedHashMap::new, Collectors.toList()))
                    .forEach((managerId, users) -> notificationService.notifyManager(
                            managerId,
                            PresenceNotificationDTO.builder()
                                    .title("Absences detectees dans votre equipe")
                                    .actor("Absence detection")
                                    .audience("MANAGER")
                                    .category("presence")
                                    .priority("high")
                                    .channel("push")
                                    .managerId(managerId)
                                    .entrepriseId(users.stream()
                                            .map(UserSummaryDTO::getEntrepriseId)
                                            .filter(Objects::nonNull)
                                            .findFirst()
                                            .orElse(null))
                                    .impactedUsers(buildImpactedUsers(users))
                                    .date(today)
                                    .eventTime(currentDateTime())
                                    .status(PresenceStatus.ABSENT)
                                    .message("Absences detectees: " + String.join(", ", buildImpactedUsers(users)))
                                    .build()
                    ));

            absentUsers.stream()
                    .filter(user -> user.getEntrepriseId() != null)
                    .collect(Collectors.groupingBy(UserSummaryDTO::getEntrepriseId, LinkedHashMap::new, Collectors.toList()))
                    .forEach((entrepriseId, users) -> notificationService.notifyHR(
                            PresenceNotificationDTO.builder()
                                    .title("Absences detectees")
                                    .actor("Absence detection")
                                    .audience("RH")
                                    .category("sla")
                                    .priority("critical")
                                    .channel("push")
                                    .entrepriseId(entrepriseId)
                                    .impactedUsers(buildImpactedUsers(users))
                                    .date(today)
                                    .eventTime(currentDateTime())
                                    .status(PresenceStatus.ABSENT)
                                    .message("Absences detectees: " + String.join(", ", buildImpactedUsers(users)))
                                    .build()
                    ));
        }
    }

    private void closeStaleOpenSessions(Long utilisateurId, LocalDate today, List<AttendanceSession> openSessions) {
        List<AttendanceSession> staleSessions = (openSessions == null ? List.<AttendanceSession>of() : openSessions).stream()
                .filter(Objects::nonNull)
                .filter(session -> !Objects.equals(resolveSessionDate(session, today), today))
                .toList();

        if (staleSessions.isEmpty()) {
            return;
        }

        for (AttendanceSession staleSession : staleSessions) {
            LocalDate sessionDate = resolveSessionDate(staleSession, today);
            if (sessionDate.isAfter(today)) {
                log.warn(
                        "Skipping stale-session auto-close for user {} and session {} because session date {} is in the future",
                        utilisateurId,
                        staleSession.getId(),
                        sessionDate
                );
                continue;
            }

            LocalDateTime closeAt = computeStaleSessionCloseTime(utilisateurId, staleSession, sessionDate);
            LocalDateTime checkInTime = staleSession.getCheckInTime();
            long duration = (checkInTime == null || closeAt == null)
                    ? 0L
                    : Math.max(Duration.between(checkInTime, closeAt).getSeconds(), 0L);

            staleSession.setCheckOutTime(closeAt);
            staleSession.setDuration(duration);
            staleSession.setStatus(AttendanceSessionStatus.AUTO_CLOSED);
            staleSession.setDailyStatus(AttendanceDayStatus.MISSING_CHECKOUT);
            staleSession.setWorkedMinutes(Math.toIntExact(duration / 60L));
            WorkSchedule schedule = resolveSchedule(utilisateurId, sessionDate);
            staleSession.setExpectedMinutes(expectedMinutes(schedule, sessionDate));
            staleSession.setOvertimeMinutes(normalizeOvertimeMode(staleSession.getOvertimeMode()) == OvertimeMode.ACTIVE
                    ? confirmedOvertimeMinutes(staleSession, closeAt)
                    : 0);
            staleSession.setOvertimeMode(OvertimeMode.FINISHED);
            staleSession.setEarlyLeaveMinutes(earlyLeaveMinutes(schedule, sessionDate, closeAt));
            staleSession.setAutoClosed(Boolean.TRUE);
            staleSession.setAutoClosedReason("MISSING_CHECKOUT");
            staleSession.setLatestAlert("MISSING_CHECKOUT");
            attendanceSessionRepository.save(staleSession);
            refreshOvertime(utilisateurId, sessionDate);
            notifyMissingCheckout(utilisateurId, staleSession);

            log.warn(
                    "Auto-closed stale open session {} for user {} on {} at {} before creating a new check-in",
                    staleSession.getId(),
                    utilisateurId,
                    sessionDate,
                    closeAt
            );
        }
    }

    private LocalDate resolveSessionDate(AttendanceSession session, LocalDate fallbackDate) {
        if (session == null) {
            return fallbackDate;
        }
        return session.getDate() != null ? session.getDate() : fallbackDate;
    }

    private LocalDateTime computeStaleSessionCloseTime(Long utilisateurId, AttendanceSession session, LocalDate sessionDate) {
        LocalDateTime checkInTime = session != null ? session.getCheckInTime() : null;
        WorkSchedule schedule = resolveSchedule(utilisateurId, sessionDate);
        LocalTime fallbackEnd = presenceProperties.getDefaults().getEndTime();
        LocalTime targetEnd = schedule != null && schedule.getHeureFin() != null ? schedule.getHeureFin() : fallbackEnd;
        LocalDateTime closeAt = LocalDateTime.of(sessionDate, targetEnd);

        if (checkInTime == null) {
            return closeAt;
        }
        if (closeAt.isBefore(checkInTime)) {
            return checkInTime;
        }
        return closeAt;
    }

    private AttendanceSummaryDTO buildTodaySummary(Long utilisateurId, LocalDate date, List<AttendanceSession> rawSessions) {
        return buildTodaySummary(utilisateurId, date, rawSessions, null, null, null, null);
    }

    private AttendanceSummaryDTO buildTodaySummary(Long utilisateurId, LocalDate date, List<AttendanceSession> rawSessions, UserSummaryDTO user, Boolean isHoliday, Set<Long> approvedLeaveUserIds, Set<Long> approvedTeleworkUserIds) {
        if (utilisateurId == null) {
            throw new IllegalStateException("Authenticated user not found");
        }
        LocalDate effectiveDate = date != null ? date : currentDate();
        UserSummaryDTO effectiveUser = user != null ? user : fetchUserSummary(utilisateurId);
        Long entrepriseId = resolveEnterpriseId(effectiveUser, rawSessions);
        WorkSchedule schedule = resolveSchedule(utilisateurId, effectiveDate);
        Integer expectedMinutes = expectedMinutes(schedule, effectiveDate);
        // Drop rows with a null check-in: the natural comparator NPEs on null,
        // and a single dirty row would 500 the whole company/team overview.
        List<AttendanceSession> sessions = (rawSessions == null ? List.<AttendanceSession>of() : rawSessions).stream()
                .filter(Objects::nonNull)
                .filter(session -> session.getCheckInTime() != null)
                .sorted(Comparator.comparing(AttendanceSession::getCheckInTime))
                .toList();
        AttendanceSession activeSession = sessions.stream()
                .filter(session -> session.getStatus() == AttendanceSessionStatus.OPEN)
                .findFirst()
                .orElse(null);
        boolean hasSessions = !sessions.isEmpty();
        boolean lateArrival = sessions.stream().anyMatch(session -> Boolean.TRUE.equals(session.getLateArrival()));
        long totalDuration = sumSessionDurations(sessions);
        int workedMinutes = Math.toIntExact(totalDuration / 60L);
        boolean leaveDay = !hasSessions && (
                approvedLeaveUserIds != null && entrepriseId != null
                        ? approvedLeaveUserIds.contains(utilisateurId)
                        : hasApprovedLeave(utilisateurId, effectiveDate));
        boolean holiday = !hasSessions && entrepriseId != null && (isHoliday != null ? isHoliday : isPublicHoliday(entrepriseId, effectiveDate));

        AttendanceSession firstCheckInSession = sessions.stream()
                .filter(session -> session.getCheckInTime() != null)
                .min(Comparator.comparing(AttendanceSession::getCheckInTime))
                .orElse(null);
        AttendanceSession lastCheckOutSession = sessions.stream()
                .filter(session -> session.getCheckOutTime() != null)
                .max(Comparator.comparing(AttendanceSession::getCheckOutTime))
                .orElse(null);
        LocalDateTime firstCheckIn = firstCheckInSession != null ? firstCheckInSession.getCheckInTime() : null;
        LocalDateTime lastCheckOut = lastCheckOutSession != null ? lastCheckOutSession.getCheckOutTime() : null;

        AttendanceDayStatus status;
        if (activeSession != null) {
            status = lateArrival ? AttendanceDayStatus.LATE : AttendanceDayStatus.WORKING;
        } else if (hasSessions) {
            AttendanceSession lastSession = sessions.get(sessions.size() - 1);
            status = lastSession.getDailyStatus() != null
                    ? lastSession.getDailyStatus()
                    : (lateArrival ? AttendanceDayStatus.LATE : AttendanceDayStatus.IDLE);
        } else {
            // N'appeler les services externes que si aucune session locale n'est trouvée (économie de 200+ appels REST sur les dashboards)
            if (leaveDay) {
                status = AttendanceDayStatus.ON_LEAVE;
            } else if (holiday) {
                status = AttendanceDayStatus.HOLIDAY;
            } else if (approvedTeleworkUserIds != null && entrepriseId != null
                    ? approvedTeleworkUserIds.contains(utilisateurId)
                    : hasApprovedTelework(utilisateurId, effectiveDate)) {
                status = AttendanceDayStatus.REMOTE;
            } else {
                status = AttendanceDayStatus.ABSENT;
            }
        }
        boolean checkedIn = firstCheckIn != null;
        boolean checkedOut = lastCheckOut != null;
        String blockReason = resolveBlockReason(checkedIn, activeSession != null, leaveDay, holiday, entrepriseId);
        AttendanceSession lastSession = sessions.isEmpty() ? null : sessions.get(sessions.size() - 1);
        OvertimeSummaryState overtimeState = resolveOvertimeSummaryState(activeSession, lastCheckOutSession, schedule, effectiveDate);

        return AttendanceSummaryDTO.builder()
                .utilisateurId(utilisateurId)
                .entrepriseId(entrepriseId)
                .date(effectiveDate)
                .status(status)
                .lateArrival(lateArrival)
                .hasOpenSession(activeSession != null)
                .checkedIn(checkedIn)
                .checkedOut(checkedOut)
                .canCheckIn(!checkedIn && blockReason == null)
                .canCheckOut(activeSession != null)
                .reasonIfBlocked(blockReason)
                .totalDuration(totalDuration)
                .currentSessionDuration(activeSession != null ? Math.toIntExact(calculateSessionDuration(activeSession) / 60L) : 0)
                .scheduledStart(schedule != null && schedule.getHeureDebut() != null ? schedule.getHeureDebut().toString() : null)
                .scheduledEnd(schedule != null && schedule.getHeureFin() != null ? schedule.getHeureFin().toString() : null)
                .expectedMinutes(expectedMinutes)
                .workedMinutes(workedMinutes)
                .overtimePreview(overtimeState.overtimeMinutes())
                .overtimeMinutes(overtimeState.overtimeMinutes())
                .overtimeMode(overtimeState.mode())
                .overtimeConfirmed(overtimeState.overtimeConfirmed())
                .showCheckoutAlert(overtimeState.showCheckoutAlert())
                .overtimeStartedAt(overtimeState.overtimeStartedAt())
                .overtimeLabel(overtimeState.label())
                .leaveOrHolidayInfo(resolveLeaveOrHolidayInfo(leaveDay, holiday))
                .latestAlert(lastSession != null ? lastSession.getLatestAlert() : null)
                .heureEntree(firstCheckIn)
                .heureSortie(lastCheckOut)
                .checkInLocation(firstCheckInSession != null ? checkInLocation(firstCheckInSession) : null)
                .checkInLocationDetails(firstCheckInSession != null ? checkInLocationDetails(firstCheckInSession) : null)
                .checkOutLocation(lastCheckOutSession != null ? checkOutLocation(lastCheckOutSession) : null)
                .checkOutLocationDetails(lastCheckOutSession != null ? checkOutLocationDetails(lastCheckOutSession) : null)
                .source(activeSession != null ? activeSession.getSource() : (hasSessions ? sessions.get(0).getSource() : null))
                .activeSession(activeSession != null ? toSessionDto(activeSession) : null)
                .sessions(sessions.stream().map(this::toSessionDto).toList())
                .build();
    }

    private OvertimeSummaryState resolveOvertimeSummaryState(
            AttendanceSession activeSession,
            AttendanceSession lastClosedSession,
            WorkSchedule schedule,
            LocalDate date
    ) {
        if (activeSession != null) {
            LocalDateTime scheduledEnd = scheduledEndDateTime(schedule, date);
            LocalDateTime now = currentDateTime();
            if (scheduledEnd == null || now.isBefore(scheduledEnd)) {
                return new OvertimeSummaryState(OvertimeMode.NONE, false, false, 0, null, "0 min");
            }
            if (isCheckInAfterScheduledEnd(schedule, activeSession.getCheckInTime(), date)) {
                if (normalizeOvertimeMode(activeSession.getOvertimeMode()) == OvertimeMode.WAITING_CONFIRMATION) {
                    activeSession.setOvertimeMode(OvertimeMode.NONE);
                    attendanceSessionRepository.save(activeSession);
                }
                return new OvertimeSummaryState(
                        OvertimeMode.NONE,
                        false,
                        false,
                        0,
                        null,
                        "Pointage hors horaire detecte"
                );
            }

            OvertimeMode mode = normalizeOvertimeMode(activeSession.getOvertimeMode());
            if (mode == OvertimeMode.ACTIVE) {
                LocalDateTime startedAt = resolveConfirmedOvertimeStart(activeSession, now);
                if (!Objects.equals(activeSession.getOvertimeStartedAt(), startedAt)) {
                    activeSession.setOvertimeStartedAt(startedAt);
                    if (activeSession.getOvertimeConfirmedAt() == null) {
                        activeSession.setOvertimeConfirmedAt(startedAt);
                    }
                    attendanceSessionRepository.save(activeSession);
                }
                int minutes = confirmedOvertimeMinutes(activeSession, now);
                return new OvertimeSummaryState(OvertimeMode.ACTIVE, false, true, minutes, startedAt, minutes + " min");
            }

            boolean changed = false;
            if (mode != OvertimeMode.WAITING_CONFIRMATION) {
                activeSession.setOvertimeMode(OvertimeMode.WAITING_CONFIRMATION);
                changed = true;
            }
            if (activeSession.getOvertimeConfirmationShownAt() == null) {
                activeSession.setOvertimeConfirmationShownAt(now);
                changed = true;
            }
            if (changed) {
                attendanceSessionRepository.save(activeSession);
            }
            return new OvertimeSummaryState(
                    OvertimeMode.WAITING_CONFIRMATION,
                    true,
                    false,
                    0,
                    null,
                    "En attente de confirmation"
            );
        }

        if (lastClosedSession != null) {
            int minutes = Math.max(Optional.ofNullable(lastClosedSession.getOvertimeMinutes()).orElse(0), 0);
            return new OvertimeSummaryState(
                    OvertimeMode.FINISHED,
                    false,
                    lastClosedSession.getOvertimeStartedAt() != null && minutes > 0,
                    minutes,
                    lastClosedSession.getOvertimeStartedAt(),
                    minutes + " min"
            );
        }

        return new OvertimeSummaryState(OvertimeMode.NONE, false, false, 0, null, "0 min");
    }

    private record OvertimeSummaryState(
            OvertimeMode mode,
            boolean showCheckoutAlert,
            boolean overtimeConfirmed,
            int overtimeMinutes,
            LocalDateTime overtimeStartedAt,
            String label
    ) {
    }

    private TeamStatusResponse buildOverview(String scope, Long teamId, List<UserSummaryDTO> users) {
        if (users == null || users.isEmpty()) {
            return emptyOverview(scope, teamId, null);
        }
        List<UserSummaryDTO> scopedUsers = distinctUsersById(users);
        if (scopedUsers.isEmpty()) {
            return emptyOverview(scope, teamId, null);
        }

        LocalDate today = currentDate();
        Map<Long, List<AttendanceSession>> sessionsByUser = attendanceSessionRepository
                .findByUtilisateurIdInAndDate(scopedUsers.stream().map(UserSummaryDTO::getId).toList(), today)
                .stream()
                .collect(Collectors.groupingBy(AttendanceSession::getUtilisateurId));

        Map<Long, Boolean> holidayByEnterprise = scopedUsers.stream()
                .map(UserSummaryDTO::getEntrepriseId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toMap(id -> id, id -> isPublicHoliday(id, today), (a, b) -> a, LinkedHashMap::new));

        Map<Long, List<Long>> userIdsByEnterprise = scopedUsers.stream()
                .filter(u -> u.getId() != null && u.getEntrepriseId() != null)
                .collect(Collectors.groupingBy(UserSummaryDTO::getEntrepriseId,
                        Collectors.mapping(UserSummaryDTO::getId, Collectors.toList())));

        Set<Long> approvedLeaveUserIds = new HashSet<>();
        Set<Long> approvedTeleworkUserIds = new HashSet<>();
        for (Map.Entry<Long, List<Long>> entry : userIdsByEnterprise.entrySet()) {
            try {
                approvedLeaveUserIds.addAll(rhServiceFeignClientWrapper.callGetUsersWithApprovedLeave(
                        entry.getKey(), entry.getValue(), today));
            } catch (Exception e) {
                log.warn("Batch leave check failed for enterprise {}, falling back", entry.getKey());
            }
            try {
                approvedTeleworkUserIds.addAll(rhServiceFeignClientWrapper.callGetUsersWithApprovedTelework(
                        entry.getKey(), entry.getValue(), today));
            } catch (Exception e) {
                log.warn("Batch telework check failed for enterprise {}, falling back", entry.getKey());
            }
        }

        List<TeamStatusResponse.MemberStatus> members = scopedUsers.parallelStream()
                .map(user -> {
                    Boolean isHoliday = user.getEntrepriseId() != null ? holidayByEnterprise.get(user.getEntrepriseId()) : null;
                    AttendanceSummaryDTO summary = buildTodaySummary(user.getId(), today, sessionsByUser.getOrDefault(user.getId(), List.of()), user, isHoliday, approvedLeaveUserIds, approvedTeleworkUserIds);
                    return toMemberStatus(user, summary);
                })
                .toList();

        long presentMembers = members.stream().filter(member -> member.getStatus() != PresenceStatus.ABSENT).count();
        long workingMembers = members.stream().filter(member -> member.getDurationSeconds() != null && member.getStatus() == PresenceStatus.PRESENT && member.getHeureSortie() == null).count();
        long lateMembers = members.stream().filter(member -> member.getStatus() == PresenceStatus.LATE).count();
        long absentMembers = members.stream().filter(member -> member.getStatus() == PresenceStatus.ABSENT).count();

        return TeamStatusResponse.builder()
                .scope(scope)
                .teamId(teamId)
                .entrepriseId(scopedUsers.stream().map(UserSummaryDTO::getEntrepriseId).filter(Objects::nonNull).findFirst().orElse(null))
                .totalMembers(scopedUsers.size())
                .presentMembers(presentMembers)
                .workingMembers(workingMembers)
                .lateMembers(lateMembers)
                .absentMembers(absentMembers)
                .members(members)
                .build();
    }

    private List<UserSummaryDTO> distinctUsersById(List<UserSummaryDTO> users) {
        return users.stream()
                .filter(Objects::nonNull)
                .filter(user -> user.getId() != null)
                .collect(Collectors.toMap(
                        UserSummaryDTO::getId,
                        user -> user,
                        (left, right) -> left,
                        LinkedHashMap::new
                ))
                .values()
                .stream()
                .toList();
    }

    private Page<AttendanceSessionViewDTO> buildScopedHistory(List<UserSummaryDTO> users, Pageable pageable) {
        if (users == null || users.isEmpty()) {
            return Page.empty(pageable == null ? org.springframework.data.domain.PageRequest.of(0, 30) : pageable);
        }

        Pageable safePageable = pageable == null
                ? org.springframework.data.domain.PageRequest.of(0, 30, org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "checkInTime"))
                : org.springframework.data.domain.PageRequest.of(
                Math.max(pageable.getPageNumber(), 0),
                Math.min(Math.max(pageable.getPageSize(), 1), 100),
                pageable.getSort().isSorted() ? pageable.getSort() : org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "checkInTime")
        );

        Map<Long, UserSummaryDTO> usersById = users.stream().collect(Collectors.toMap(UserSummaryDTO::getId, user -> user, (left, right) -> left, LinkedHashMap::new));
        return attendanceSessionRepository.findByUtilisateurIdIn(usersById.keySet(), safePageable)
                .map(session -> toSessionViewDto(session, usersById.get(session.getUtilisateurId())));
    }

    private TeamStatusResponse emptyOverview(String scope, Long teamId, Long entrepriseId) {
        return TeamStatusResponse.builder()
                .scope(scope)
                .teamId(teamId)
                .entrepriseId(entrepriseId)
                .totalMembers(0)
                .presentMembers(0)
                .workingMembers(0)
                .lateMembers(0)
                .absentMembers(0)
                .members(List.of())
                .build();
    }

    private TeamStatusResponse.MemberStatus toMemberStatus(UserSummaryDTO user, AttendanceSummaryDTO summary) {
        AttendanceDayStatus dayStatus = summary.getStatus();
        Boolean scheduledWorkday = summary.getExpectedMinutes() != null
                ? summary.getExpectedMinutes() > 0
                : null;
        return TeamStatusResponse.MemberStatus.builder()
                .utilisateurId(user.getId())
                .nomComplet(resolveFullName(user))
                .date(summary.getDate())
                .status(mapTeamStatus(dayStatus))
                .heureEntree(summary.getHeureEntree() != null ? summary.getHeureEntree().toLocalTime().toString() : null)
                .heureSortie(summary.getHeureSortie() != null ? summary.getHeureSortie().toLocalTime().toString() : null)
                .checkInLocation(summary.getCheckInLocation())
                .checkInLocationDetails(summary.getCheckInLocationDetails())
                .checkOutLocation(summary.getCheckOutLocation())
                .checkOutLocationDetails(summary.getCheckOutLocationDetails())
                .durationSeconds(summary.getTotalDuration())
                .workedMinutes(summary.getWorkedMinutes())
                .expectedMinutes(summary.getExpectedMinutes())
                .scheduledStart(summary.getScheduledStart())
                .scheduledEnd(summary.getScheduledEnd())
                .scheduledWorkday(scheduledWorkday)
                .approvedLeave(dayStatus == AttendanceDayStatus.ON_LEAVE)
                .approvedTelework(dayStatus == AttendanceDayStatus.REMOTE)
                .holiday(dayStatus == AttendanceDayStatus.HOLIDAY)
                .overtimeMinutes(summary.getOvertimeMode() == OvertimeMode.FINISHED
                        ? Math.max(Optional.ofNullable(summary.getOvertimeMinutes()).orElse(0), 0)
                        : 0)
                .latestAlert(summary.getLatestAlert())
                .autoClosed(summary.getSessions() != null && summary.getSessions().stream().anyMatch(session -> Boolean.TRUE.equals(session.getAutoClosed())))
                .lateArrival(summary.getLateArrival())
                .managerId(user.getManagerId())
                .equipeId(user.getEquipeId())
                .equipe(user.getEquipe())
                .entrepriseId(user.getEntrepriseId())
                .entreprise(user.getEntreprise())
                .build();
    }

    private AttendanceSessionViewDTO toSessionViewDto(AttendanceSession session, UserSummaryDTO user) {
        AttendanceSessionDTO dto = toSessionDto(session);
        return AttendanceSessionViewDTO.builder()
                .id(dto.getId())
                .utilisateurId(dto.getUtilisateurId())
                .nomComplet(resolveFullName(user))
                .equipeId(user != null ? user.getEquipeId() : null)
                .equipe(user != null ? user.getEquipe() : null)
                .entrepriseId(user != null ? user.getEntrepriseId() : null)
                .entreprise(user != null ? user.getEntreprise() : null)
                .date(dto.getDate())
                .checkInTime(dto.getCheckInTime())
                .checkOutTime(dto.getCheckOutTime())
                .duration(dto.getDuration())
                .status(dto.getStatus())
                .source(dto.getSource())
                .localisation(dto.getLocalisation())
                .checkInLatitude(dto.getCheckInLatitude())
                .checkInLongitude(dto.getCheckInLongitude())
                .checkInAddress(dto.getCheckInAddress())
                .checkInLocation(dto.getCheckInLocation())
                .checkInLocationDetails(dto.getCheckInLocationDetails())
                .checkOutLatitude(dto.getCheckOutLatitude())
                .checkOutLongitude(dto.getCheckOutLongitude())
                .checkOutAddress(dto.getCheckOutAddress())
                .checkOutLocation(dto.getCheckOutLocation())
                .checkOutLocationDetails(dto.getCheckOutLocationDetails())
                .lateArrival(dto.getLateArrival())
                .dailyStatus(dto.getDailyStatus())
                .createdAt(dto.getCreatedAt())
                .build();
    }

    private PresenceStatsDTO buildStatsForUsers(List<UserSummaryDTO> users, LocalDate dateFrom, LocalDate dateTo) {
        if (users == null || users.isEmpty()) {
            return emptyStats(dateFrom, dateTo);
        }

        List<Long> userIds = users.stream().map(UserSummaryDTO::getId).filter(Objects::nonNull).toList();
        Map<Long, List<AttendanceSession>> sessionsByUser = attendanceSessionRepository
                .findByUtilisateurIdInAndDateBetween(userIds, dateFrom, dateTo)
                .stream()
                .collect(Collectors.groupingBy(AttendanceSession::getUtilisateurId));

        long totalPresent = 0;
        long totalAbsent = 0;
        long lateCount = 0;
        long workedSeconds = 0;

        Map<Long, Boolean> holidayByEnterprise = users.stream()
                .map(UserSummaryDTO::getEntrepriseId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toMap(id -> id, id -> isPublicHoliday(id, dateTo), (a, b) -> a, LinkedHashMap::new));

        Map<Long, List<Long>> userIdsByEnterprise = users.stream()
                .filter(u -> u.getId() != null && u.getEntrepriseId() != null)
                .collect(Collectors.groupingBy(UserSummaryDTO::getEntrepriseId,
                        Collectors.mapping(UserSummaryDTO::getId, Collectors.toList())));

        Set<Long> approvedLeaveUserIds = new HashSet<>();
        Set<Long> approvedTeleworkUserIds = new HashSet<>();
        for (Map.Entry<Long, List<Long>> entry : userIdsByEnterprise.entrySet()) {
            try {
                approvedLeaveUserIds.addAll(rhServiceFeignClientWrapper.callGetUsersWithApprovedLeave(
                        entry.getKey(), entry.getValue(), dateTo));
            } catch (Exception e) {
                log.warn("Batch leave check failed for enterprise {}, falling back", entry.getKey());
            }
            try {
                approvedTeleworkUserIds.addAll(rhServiceFeignClientWrapper.callGetUsersWithApprovedTelework(
                        entry.getKey(), entry.getValue(), dateTo));
            } catch (Exception e) {
                log.warn("Batch telework check failed for enterprise {}, falling back", entry.getKey());
            }
        }

        List<AttendanceSummaryDTO> summaries = users.parallelStream()
                .map(user -> {
                    Boolean isHoliday = user.getEntrepriseId() != null ? holidayByEnterprise.get(user.getEntrepriseId()) : null;
                    return buildTodaySummary(user.getId(), dateTo, sessionsByUser.getOrDefault(user.getId(), List.of()), user, isHoliday, approvedLeaveUserIds, approvedTeleworkUserIds);
                })
                .toList();

        for (AttendanceSummaryDTO summary : summaries) {
            AttendanceDayStatus status = summary.getStatus();

            if (status == AttendanceDayStatus.ABSENT) {
                totalAbsent++;
            } else {
                totalPresent++;
                if (status == AttendanceDayStatus.LATE) {
                    lateCount++;
                }
            }
            workedSeconds += summary.getTotalDuration() != null ? summary.getTotalDuration() : 0L;
        }

        return PresenceStatsDTO.builder()
                .dateFrom(dateFrom)
                .dateTo(dateTo)
                .totalPresent(totalPresent)
                .totalAbsent(totalAbsent)
                .lateCount(lateCount)
                .totalHoursThisWeek(toHours(workedSeconds))
                .totalHoursWorked(toHours(workedSeconds))
                .averageArrivalTime("--:--")
                .onTimeCount(Math.max(totalPresent - lateCount, 0))
                .overtimeHours(Optional.ofNullable(overtimeRepository.sumHeuresSupplementairesBetween(dateFrom, dateTo)).orElse(BigDecimal.ZERO))
                .onTimeArrivals(Math.max(totalPresent - lateCount, 0))
                .lateArrivals(lateCount)
                .dailyStatuses(List.of())
                .build();
    }

    private List<UserSummaryDTO> filterUsersByTeam(List<UserSummaryDTO> users, Long teamId) {
        if (teamId == null) {
            return users == null ? List.of() : users;
        }
        return (users == null ? List.<UserSummaryDTO>of() : users).stream()
                .filter(user -> Objects.equals(user.getEquipeId(), teamId))
                .toList();
    }

    private List<UserSummaryDTO> filterUsersByEntreprise(List<UserSummaryDTO> users, Long entrepriseId) {
        if (entrepriseId == null) {
            return List.of();
        }
        return (users == null ? List.<UserSummaryDTO>of() : users).stream()
                .filter(user -> Objects.equals(user.getEntrepriseId(), entrepriseId))
                .toList();
    }

    private UserSummaryDTO requireUserWithEnterprise(Long userId) {
        UserSummaryDTO user = fetchUserSummary(userId);
        if (user == null || user.getEntrepriseId() == null) {
            throw new PresenceBusinessException(
                    HttpStatus.CONFLICT,
                    "USER_ENTERPRISE_REQUIRED",
                    "Votre entreprise n'est pas configuree. Contactez votre administrateur."
            );
        }
        return user;
    }

    private Long resolveEnterpriseId(UserSummaryDTO user, List<AttendanceSession> sessions) {
        if (user != null && user.getEntrepriseId() != null) {
            return user.getEntrepriseId();
        }
        return (sessions == null ? List.<AttendanceSession>of() : sessions).stream()
                .map(AttendanceSession::getEntrepriseId)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
    }

    private void validateGps(String action, Double latitude, Double longitude, Double accuracy) {
        boolean anyLocationProvided = latitude != null || longitude != null || accuracy != null;
        if (presenceProperties.isGpsRequired() && !anyLocationProvided) {
            throw new PresenceBusinessException(
                    HttpStatus.BAD_REQUEST,
                    "GPS_REQUIRED",
                    "La localisation GPS est requise pour le pointage."
            );
        }
        if (!anyLocationProvided) {
            return;
        }
        if (latitude == null || longitude == null) {
            throw new PresenceBusinessException(
                    HttpStatus.BAD_REQUEST,
                    "GPS_INVALID",
                    "Coordonnees GPS incompletes pour " + action + "."
            );
        }
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new PresenceBusinessException(
                    HttpStatus.BAD_REQUEST,
                    "GPS_INVALID",
                    "Coordonnees GPS invalides."
            );
        }
        if (accuracy != null && accuracy < 0) {
            throw new PresenceBusinessException(
                    HttpStatus.BAD_REQUEST,
                    "GPS_INVALID",
                    "Precision GPS invalide."
            );
        }
    }

    @Override
    @Transactional
    public void autoCloseOpenSessions() {
        LocalDate today = currentDate();
        LocalDateTime now = currentDateTime();
        List<AttendanceSession> openSessions = attendanceSessionRepository.findByDateLessThanEqualAndStatus(today, AttendanceSessionStatus.OPEN);
        int graceMinutes = Math.max(Optional.ofNullable(presenceProperties.getAutoCloseGraceMinutes()).orElse(60), 0);

        for (AttendanceSession session : openSessions) {
            LocalDate sessionDate = resolveSessionDate(session, today);
            WorkSchedule schedule = resolveSchedule(session.getUtilisateurId(), sessionDate);
            LocalDateTime scheduledEnd = computeStaleSessionCloseTime(session.getUtilisateurId(), session, sessionDate);
            if (scheduledEnd == null || !now.isAfter(scheduledEnd.plusMinutes(graceMinutes))) {
                continue;
            }
            long duration = Math.max(Duration.between(session.getCheckInTime(), scheduledEnd).getSeconds(), 0L);
            session.setCheckOutTime(scheduledEnd);
            session.setDuration(duration);
            session.setStatus(AttendanceSessionStatus.AUTO_CLOSED);
            session.setDailyStatus(AttendanceDayStatus.MISSING_CHECKOUT);
            session.setWorkedMinutes(Math.toIntExact(duration / 60L));
            session.setExpectedMinutes(expectedMinutes(schedule, sessionDate));
            session.setOvertimeMinutes(normalizeOvertimeMode(session.getOvertimeMode()) == OvertimeMode.ACTIVE
                    ? confirmedOvertimeMinutes(session, scheduledEnd)
                    : 0);
            session.setOvertimeMode(OvertimeMode.FINISHED);
            session.setEarlyLeaveMinutes(earlyLeaveMinutes(schedule, sessionDate, scheduledEnd));
            session.setAutoClosed(Boolean.TRUE);
            session.setAutoClosedReason("MISSING_CHECKOUT");
            session.setLatestAlert("MISSING_CHECKOUT");
            attendanceSessionRepository.save(session);
            refreshOvertime(session.getUtilisateurId(), sessionDate);
            notifyMissingCheckout(session.getUtilisateurId(), session);
        }
    }

    @Override
    public void detectMissingCheckIns() {
        List<UserSummaryDTO> activeUsers = fetchActiveUsers();
        if (activeUsers.isEmpty()) {
            return;
        }
        LocalDate today = currentDate();
        LocalDateTime now = currentDateTime();

        Map<Long, Boolean> holidayByEnterprise = activeUsers.stream()
                .map(UserSummaryDTO::getEntrepriseId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toMap(id -> id, id -> isPublicHoliday(id, today), (a, b) -> a, LinkedHashMap::new));

        Map<Long, List<Long>> userIdsByEnterprise = activeUsers.stream()
                .filter(u -> u.getId() != null && u.getEntrepriseId() != null)
                .collect(Collectors.groupingBy(UserSummaryDTO::getEntrepriseId,
                        Collectors.mapping(UserSummaryDTO::getId, Collectors.toList())));

        Set<Long> approvedLeaveUserIds = new HashSet<>();
        Set<Long> approvedTeleworkUserIds = new HashSet<>();
        for (Map.Entry<Long, List<Long>> entry : userIdsByEnterprise.entrySet()) {
            try {
                approvedLeaveUserIds.addAll(rhServiceFeignClientWrapper.callGetUsersWithApprovedLeave(
                        entry.getKey(), entry.getValue(), today));
            } catch (Exception e) {
                log.warn("Batch leave check failed for enterprise {}, falling back", entry.getKey());
            }
            try {
                approvedTeleworkUserIds.addAll(rhServiceFeignClientWrapper.callGetUsersWithApprovedTelework(
                        entry.getKey(), entry.getValue(), today));
            } catch (Exception e) {
                log.warn("Batch telework check failed for enterprise {}, falling back", entry.getKey());
            }
        }

        for (UserSummaryDTO user : activeUsers) {
            if (user.getId() == null || user.getEntrepriseId() == null) {
                continue;
            }
            WorkSchedule schedule = resolveSchedule(user.getId(), today);
            if (!isWorkingDay(schedule, today) || approvedLeaveUserIds.contains(user.getId())
                    || approvedTeleworkUserIds.contains(user.getId()) || Boolean.TRUE.equals(holidayByEnterprise.get(user.getEntrepriseId()))) {
                continue;
            }
            LocalDateTime alertAt = LocalDateTime.of(today, schedule.getHeureDebut())
                    .plusMinutes(schedule.getToleranceRetardMinutes());
            if (now.isBefore(alertAt) || !now.isBefore(alertAt.plusMinutes(15))) {
                continue;
            }
            if (attendanceSessionRepository.existsByUtilisateurIdAndDate(user.getId(), today)) {
                continue;
            }
            notifyMissingCheckIn(user, today);
        }
    }

    private Integer expectedMinutes(WorkSchedule schedule, LocalDate date) {
        if (schedule == null || !isWorkingDay(schedule, date)
                || schedule.getHeureDebut() == null || schedule.getHeureFin() == null) {
            return 0;
        }
        long minutes = Duration.between(schedule.getHeureDebut(), schedule.getHeureFin()).toMinutes();
        return Math.toIntExact(Math.max(minutes, 0L));
    }

    private Integer earlyLeaveMinutes(WorkSchedule schedule, LocalDate date, LocalDateTime checkOutTime) {
        if (schedule == null || !isWorkingDay(schedule, date)
                || schedule.getHeureFin() == null || checkOutTime == null) {
            return 0;
        }
        LocalDateTime scheduledEnd = LocalDateTime.of(date, schedule.getHeureFin());
        return Math.toIntExact(Math.max(Duration.between(checkOutTime, scheduledEnd).toMinutes(), 0L));
    }

    private boolean isCheckInAfterScheduledEnd(WorkSchedule schedule, LocalDateTime checkInTime, LocalDate date) {
        LocalDateTime scheduledEnd = scheduledEndDateTime(schedule, date);
        return scheduledEnd != null && checkInTime != null && !checkInTime.isBefore(scheduledEnd);
    }

    private int confirmedOvertimeMinutes(AttendanceSession session, LocalDateTime endTime) {
        if (session == null || endTime == null) {
            return 0;
        }
        LocalDateTime start = resolveConfirmedOvertimeStart(session, endTime);
        long minutes = Duration.between(start, endTime).toMinutes();
        return Math.toIntExact(Math.max(minutes, 0L));
    }

    private LocalDateTime resolveConfirmedOvertimeStart(AttendanceSession session, LocalDateTime fallback) {
        LocalDateTime startedAt = session != null ? session.getOvertimeStartedAt() : null;
        LocalDateTime confirmedAt = session != null ? session.getOvertimeConfirmedAt() : null;
        if (confirmedAt != null && (startedAt == null || confirmedAt.isAfter(startedAt))) {
            return confirmedAt;
        }
        if (startedAt != null) {
            return startedAt;
        }
        return fallback != null ? fallback : currentDateTime();
    }

    private LocalDateTime scheduledEndDateTime(WorkSchedule schedule, LocalDate date) {
        if (schedule == null || date == null || !isWorkingDay(schedule, date) || schedule.getHeureFin() == null) {
            return null;
        }
        return LocalDateTime.of(date, schedule.getHeureFin());
    }

    private OvertimeMode normalizeOvertimeMode(OvertimeMode mode) {
        return mode == null ? OvertimeMode.NONE : mode;
    }

    private AttendanceDayStatus resolveClosedDailyStatus(AttendanceSession session, int earlyLeaveMinutes) {
        if (Boolean.TRUE.equals(session.getAutoClosed())) {
            return AttendanceDayStatus.AUTO_CLOSED;
        }
        if (earlyLeaveMinutes > 0) {
            return AttendanceDayStatus.EARLY_LEAVE;
        }
        if (Boolean.TRUE.equals(session.getLateArrival())) {
            return AttendanceDayStatus.LATE;
        }
        return AttendanceDayStatus.IDLE;
    }

    private String resolveBlockReason(boolean checkedIn, boolean activeSession, boolean leaveDay, boolean holiday, Long entrepriseId) {
        if (checkedIn && activeSession) {
            return "Vous avez deja pointe votre entree aujourd'hui.";
        }
        if (checkedIn) {
            return "Votre journee est deja cloturee.";
        }
        if (leaveDay) {
            return "Vous ne pouvez pas pointer aujourd'hui car vous etes en conge approuve.";
        }
        if (holiday) {
            return "Vous ne pouvez pas pointer aujourd'hui car c'est un jour ferie.";
        }
        if (entrepriseId == null) {
            return "Votre entreprise n'est pas configuree.";
        }
        return null;
    }

    private String resolveLeaveOrHolidayInfo(boolean leaveDay, boolean holiday) {
        if (leaveDay) {
            return "Conge approuve";
        }
        if (holiday) {
            return "Jour ferie";
        }
        return null;
    }

    private UserSummaryDTO fetchUserSummary(Long userId) {
        if (userId == null) return null;
        CacheEntry<UserSummaryDTO> entry = userCache.get(userId);
        if (entry != null && !entry.isExpired(CACHE_TTL_MS)) {
            return entry.value;
        }
        try {
            UserSummaryDTO user = userServiceClient.getUserById(userId);
            userCache.put(userId, new CacheEntry<>(user));
            return user;
        } catch (Exception exception) {
            log.warn("Unable to fetch user {} summary: {}", userId, exception.getMessage());
            return null;
        }
    }

    private Map<String, Long> groupUsersBy(List<UserSummaryDTO> users, java.util.function.Function<UserSummaryDTO, String> classifier) {
        return users.stream()
                .map(user -> {
                    String key = classifier.apply(user);
                    return (key == null || key.isBlank()) ? "Non renseigne" : key;
                })
                .collect(Collectors.groupingBy(value -> value, LinkedHashMap::new, Collectors.counting()));
    }

    private String resolveFullName(UserSummaryDTO user) {
        if (user == null) {
            return "Collaborateur";
        }
        String fullName = user.getFullName();
        if (fullName == null || fullName.isBlank()) {
            fullName = Stream.of(user.getPrenom(), user.getNom())
                    .filter(Objects::nonNull)
                    .filter(value -> !value.isBlank())
                    .collect(Collectors.joining(" "));
        }
        return (fullName == null || fullName.isBlank()) ? "Collaborateur" : fullName;
    }

    private boolean managerExists(Long managerId) {
        try {
            return userServiceClient.getUserById(managerId) != null;
        } catch (Exception exception) {
            log.warn("Unable to resolve manager {} from organisation-service: {}", managerId, exception.getMessage());
            return false;
        }
    }

    private List<UserSummaryDTO> fetchTeamMembers(Long managerId) {
        try {
            List<UserSummaryDTO> members = userServiceClient.getTeamMembers(managerId);
            return members == null ? List.of() : members.stream()
                    .filter(Objects::nonNull)
                    .filter(member -> member.getId() != null)
                    .toList();
        } catch (Exception exception) {
            log.error("Unable to fetch team members for manager {}: {}", managerId, exception.getMessage());
            return List.of();
        }
    }

    private List<UserSummaryDTO> fetchActiveUsers() {
        try {
            List<UserSummaryDTO> activeUsers = userServiceClient.getActiveUsers();
            return activeUsers == null ? List.of() : activeUsers.stream()
                    .filter(Objects::nonNull)
                    .filter(user -> user.getId() != null)
                    .toList();
        } catch (Exception exception) {
            log.error("Unable to fetch active users for presence statistics: {}", exception.getMessage());
            return List.of();
        }
    }

    private PresenceStatsDTO emptyStats(LocalDate dateFrom, LocalDate dateTo) {
        return PresenceStatsDTO.builder()
                .dateFrom(dateFrom)
                .dateTo(dateTo)
                .totalPresent(0)
                .totalAbsent(0)
                .lateCount(0)
                .totalHoursThisWeek(BigDecimal.ZERO)
                .totalHoursWorked(BigDecimal.ZERO)
                .averageArrivalTime("--:--")
                .onTimeCount(0)
                .overtimeHours(BigDecimal.ZERO)
                .onTimeArrivals(0)
                .lateArrivals(0)
                .dailyStatuses(List.of())
                .build();
    }

    private AttendanceSessionDTO toSessionDto(AttendanceSession session) {
        AttendanceSessionDTO dto = attendanceSessionMapper.toDto(session);
        dto.setDuration(calculateSessionDuration(session));
        dto.setCheckInLocation(checkInLocation(session));
        dto.setCheckOutLocation(checkOutLocation(session));
        dto.setCheckInLocationDetails(checkInLocationDetails(session));
        dto.setCheckOutLocationDetails(checkOutLocationDetails(session));
        return dto;
    }

    private String checkInLocation(AttendanceSession session) {
        if (session == null) {
            return null;
        }
        return locationResolverService.displayLocation(
                session.getCheckInAddress(),
                session.getCheckInCity(),
                session.getCheckInRegion(),
                session.getCheckInCountry(),
                session.getCheckInLatitude(),
                session.getCheckInLongitude()
        );
    }

    private String checkOutLocation(AttendanceSession session) {
        if (session == null) {
            return null;
        }
        return locationResolverService.displayLocation(
                session.getCheckOutAddress(),
                session.getCheckOutCity(),
                session.getCheckOutRegion(),
                session.getCheckOutCountry(),
                session.getCheckOutLatitude(),
                session.getCheckOutLongitude()
        );
    }

    private PointageLocationDTO checkInLocationDetails(AttendanceSession session) {
        if (session == null) {
            return null;
        }
        return toLocationDetails(
                session.getCheckInLatitude(),
                session.getCheckInLongitude(),
                session.getCheckInAccuracy(),
                session.getCheckInAddress(),
                session.getCheckInCity(),
                session.getCheckInRegion(),
                session.getCheckInCountry()
        );
    }

    private PointageLocationDTO checkOutLocationDetails(AttendanceSession session) {
        if (session == null) {
            return null;
        }
        return toLocationDetails(
                session.getCheckOutLatitude(),
                session.getCheckOutLongitude(),
                session.getCheckOutAccuracy(),
                session.getCheckOutAddress(),
                session.getCheckOutCity(),
                session.getCheckOutRegion(),
                session.getCheckOutCountry()
        );
    }

    private PointageLocationDTO toLocationDetails(
            Double latitude,
            Double longitude,
            Double accuracy,
            String address,
            String city,
            String region,
            String country
    ) {
        boolean hasCoordinates = latitude != null && longitude != null;
        boolean hasReadableDetails = Stream.of(address, city, region, country)
                .filter(Objects::nonNull)
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

    private LocationResolverService.ResolvedLocation resolveLocationForStorage(
            Double latitude,
            Double longitude,
            Double accuracy,
            String providedAddress
    ) {
        LocationResolverService.ResolvedLocation resolved = locationResolverService.resolveLocationForStorage(
                latitude,
                longitude,
                accuracy,
                providedAddress
        );
        if (resolved != null) {
            return resolved;
        }
        return new LocationResolverService.ResolvedLocation(
                latitude,
                longitude,
                accuracy,
                locationResolverService.formatCoordinates(latitude, longitude),
                null,
                null,
                null
        );
    }

    private WorkSchedule resolveSchedule(Long utilisateurId, LocalDate date) {
        try {
            return horaireManagementService.resolveEffectiveWorkSchedule(utilisateurId, date);
        } catch (Exception exception) {
            log.warn("Unable to resolve effective schedule for user {} on {}: {}", utilisateurId, date, exception.getMessage());
            return workScheduleRepository.findByUtilisateurId(utilisateurId)
                    .orElseGet(() -> WorkSchedule.builder()
                            .utilisateurId(utilisateurId)
                            .heureDebut(presenceProperties.getDefaults().getStartTime())
                            .heureFin(presenceProperties.getDefaults().getEndTime())
                            .toleranceRetardMinutes(presenceProperties.getDefaults().getToleranceMinutes())
                            .joursTravail(Set.copyOf(presenceProperties.getDefaults().getWorkingDays()))
                            .build());
        }
    }

    private boolean isWorkingDay(WorkSchedule schedule, LocalDate date) {
        Set<DayOfWeek> workingDays = (schedule.getJoursTravail() == null || schedule.getJoursTravail().isEmpty())
                ? Set.copyOf(presenceProperties.getDefaults().getWorkingDays())
                : schedule.getJoursTravail();
        return workingDays.contains(date.getDayOfWeek());
    }

    private boolean isLateArrival(WorkSchedule schedule, LocalDateTime checkInTime, LocalDate date) {
        if (!isWorkingDay(schedule, date)) {
            return false;
        }
        LocalDateTime expectedStart = LocalDateTime.of(date, schedule.getHeureDebut());
        return checkInTime.isAfter(expectedStart.plusMinutes(schedule.getToleranceRetardMinutes()));
    }

    private long sumSessionDurations(Collection<AttendanceSession> sessions) {
        return sessions.stream().mapToLong(this::calculateSessionDuration).sum();
    }

    private long calculateSessionDuration(AttendanceSession session) {
        if (session == null) {
            return 0L;
        }
        if (session.getStatus() == AttendanceSessionStatus.OPEN || session.getCheckOutTime() == null) {
            // Open/unclosed session: elapsed since check-in. Guard a null check-in
            // (dirty data) by falling back to the stored duration.
            if (session.getCheckInTime() == null) {
                return session.getDuration() != null ? session.getDuration() : 0L;
            }
            return Math.max(Duration.between(session.getCheckInTime(), currentDateTime()).getSeconds(), 0);
        }
        return session.getDuration() != null ? session.getDuration() : 0L;
    }



    private void refreshOvertime(Long utilisateurId, LocalDate date) {
        WorkSchedule schedule = resolveSchedule(utilisateurId, date);
        List<AttendanceSession> sessions = attendanceSessionRepository.findByUtilisateurIdAndDateOrderByCheckInTimeAsc(utilisateurId, date);
        long expectedSeconds = isWorkingDay(schedule, date)
                ? Duration.between(schedule.getHeureDebut(), schedule.getHeureFin()).getSeconds()
                : 0L;
        AttendanceSession lastClosedSession = sessions.stream()
                .filter(session -> session.getCheckOutTime() != null)
                .max(Comparator.comparing(AttendanceSession::getCheckOutTime))
                .orElse(null);
        if (lastClosedSession == null) {
            overtimeRepository.deleteByUtilisateurIdAndDate(utilisateurId, date);
            return;
        }

        int overtimeMinutes = Math.max(Optional.ofNullable(lastClosedSession.getOvertimeMinutes()).orElse(0), 0);
        if (overtimeMinutes <= 0 || lastClosedSession.getOvertimeStartedAt() == null || lastClosedSession.getCheckOutTime() == null) {
            overtimeRepository.deleteByUtilisateurIdAndDate(utilisateurId, date);
            return;
        }

        long overtimeSeconds = overtimeMinutes * 60L;

        BigDecimal overtimeHours = BigDecimal.valueOf(overtimeSeconds)
                .divide(BigDecimal.valueOf(3600L), 2, RoundingMode.HALF_UP);

        Overtime overtime = overtimeRepository.findByAttendanceId(lastClosedSession.getId())
                .or(() -> overtimeRepository.findByUtilisateurIdAndDate(utilisateurId, date))
                .orElseGet(() -> Overtime.builder()
                        .utilisateurId(utilisateurId)
                        .date(date)
                        .approuvee(Boolean.FALSE)
                        .status(OvertimeStatus.PENDING_MANAGER)
                        .build());
        UserSummaryDTO user = fetchUserSummary(utilisateurId);

        overtime.setHeuresSupplementaires(overtimeHours);
        overtime.setEntrepriseId(lastClosedSession.getEntrepriseId());
        overtime.setAttendanceId(lastClosedSession.getId());
        overtime.setScheduledStart(schedule != null && schedule.getHeureDebut() != null ? LocalDateTime.of(date, schedule.getHeureDebut()) : null);
        overtime.setScheduledEnd(schedule != null && schedule.getHeureFin() != null ? LocalDateTime.of(date, schedule.getHeureFin()) : null);
        overtime.setCheckInTime(lastClosedSession.getCheckInTime());
        overtime.setCheckOutTime(lastClosedSession.getCheckOutTime());
        overtime.setActualCheckOut(lastClosedSession.getCheckOutTime());
        overtime.setOvertimeStart(lastClosedSession.getOvertimeStartedAt());
        overtime.setOvertimeEnd(lastClosedSession.getCheckOutTime());
        overtime.setWorkedMinutes(lastClosedSession.getWorkedMinutes());
        overtime.setExpectedMinutes(lastClosedSession.getExpectedMinutes() != null ? lastClosedSession.getExpectedMinutes() : Math.toIntExact(expectedSeconds / 60L));
        overtime.setOvertimeMinutes(overtimeMinutes);
        overtime.setManagerId(user != null ? user.getManagerId() : overtime.getManagerId());
        if (overtime.getReason() == null || overtime.getReason().isBlank()) {
            overtime.setReason("Travail au-dela de l'horaire planifie");
        }
        if (overtime.getStatus() == null || overtime.getStatus() == OvertimeStatus.NO_OVERTIME || overtime.getStatus() == OvertimeStatus.NONE) {
            overtime.setStatus(OvertimeStatus.PENDING_MANAGER);
        }
        overtime.setApprouvee(isApprovedOvertimeStatus(overtime.getStatus()));
        overtimeRepository.save(overtime);
    }

    private boolean isApprovedOvertimeStatus(OvertimeStatus status) {
        return status == OvertimeStatus.APPROVED_MANAGER
                || status == OvertimeStatus.APPROVED_RH
                || status == OvertimeStatus.APPROUVEE_MANAGER
                || status == OvertimeStatus.APPROUVEE_RH
                || status == OvertimeStatus.APPROVED;
    }

    private void maybeNotifyLateArrival(Long utilisateurId, AttendanceSession session, boolean lateArrival) {
        if (!lateArrival) {
            return;
        }

        try {
            UserSummaryDTO user = userServiceClient.getUserById(utilisateurId);
            if (user == null) {
                return;
            }

            String fullName = resolveFullName(user);
            notificationService.notifyUser(
                    user.getId(),
                    PresenceNotificationDTO.builder()
                            .title("Retard enregistre")
                            .actor("Attendance pulse")
                            .audience("EMPLOYEE")
                            .category("presence")
                            .priority("normal")
                            .channel("push")
                            .userId(user.getId())
                            .entrepriseId(user.getEntrepriseId())
                            .fullName(fullName)
                            .departement(user.getDepartement())
                            .equipe(user.getEquipe())
                            .date(session.getDate())
                            .eventTime(session.getCheckInTime())
                            .status(PresenceStatus.LATE)
                            .message("Votre arrivee du " + session.getDate() + " a " + session.getCheckInTime().toLocalTime() + " a ete enregistree comme un retard.")
                            .build()
            );

            if (user.getManagerId() != null) {
                notificationService.notifyManager(
                        user.getManagerId(),
                        PresenceNotificationDTO.builder()
                                .title("Retard detecte")
                                .actor("Attendance pulse")
                                .audience("MANAGER")
                                .category("presence")
                                .priority("high")
                                .channel("push")
                                .managerId(user.getManagerId())
                                .userId(user.getId())
                                .entrepriseId(user.getEntrepriseId())
                                .fullName(fullName)
                                .departement(user.getDepartement())
                                .equipe(user.getEquipe())
                                .date(session.getDate())
                                .eventTime(session.getCheckInTime())
                                .status(PresenceStatus.LATE)
                                .message("Retard detecte pour " + fullName + " a " + session.getCheckInTime().toLocalTime())
                                .build()
                );
            }
        } catch (Exception exception) {
            log.warn("Could not dispatch late-arrival notifications: {}", exception.getMessage());
        }
    }

    private void notifyMissingCheckout(Long utilisateurId, AttendanceSession session) {
        try {
            UserSummaryDTO user = userServiceClient.getUserById(utilisateurId);
            if (user == null) {
                return;
            }
            String fullName = resolveFullName(user);
            PresenceNotificationDTO base = PresenceNotificationDTO.builder()
                    .title("Sortie de pointage manquante")
                    .actor("Attendance automation")
                    .category("presence")
                    .priority("high")
                    .channel("push")
                    .userId(user.getId())
                    .entrepriseId(user.getEntrepriseId())
                    .fullName(fullName)
                    .departement(user.getDepartement())
                    .equipe(user.getEquipe())
                    .date(session.getDate())
                    .eventTime(session.getCheckOutTime())
                    .status(PresenceStatus.PRESENT)
                    .message("Votre session de pointage a ete cloturee automatiquement car la sortie etait manquante.")
                    .build();
            base.setAudience("EMPLOYEE");
            notificationService.notifyUser(user.getId(), base);

            if (user.getManagerId() != null) {
                PresenceNotificationDTO managerNotification = PresenceNotificationDTO.builder()
                        .title("Sortie manquante")
                        .actor("Attendance automation")
                        .audience("MANAGER")
                        .category("presence")
                        .priority("high")
                        .channel("push")
                        .managerId(user.getManagerId())
                        .userId(user.getId())
                        .entrepriseId(user.getEntrepriseId())
                        .fullName(fullName)
                        .departement(user.getDepartement())
                        .equipe(user.getEquipe())
                        .date(session.getDate())
                        .eventTime(session.getCheckOutTime())
                        .status(PresenceStatus.PRESENT)
                        .message("Sortie manquante auto-cloturee pour " + fullName + ".")
                        .build();
                notificationService.notifyManager(user.getManagerId(), managerNotification);
            }
        } catch (Exception exception) {
            log.warn("Could not dispatch missing-checkout notification: {}", exception.getMessage());
        }
    }

    private void notifyMissingCheckIn(UserSummaryDTO user, LocalDate date) {
        try {
            String fullName = resolveFullName(user);
            PresenceNotificationDTO employeeNotification = PresenceNotificationDTO.builder()
                    .title("Pointage d'entree manquant")
                    .actor("Attendance automation")
                    .audience("EMPLOYEE")
                    .category("presence")
                    .priority("high")
                    .channel("push")
                    .userId(user.getId())
                    .entrepriseId(user.getEntrepriseId())
                    .fullName(fullName)
                    .departement(user.getDepartement())
                    .equipe(user.getEquipe())
                    .date(date)
                    .eventTime(currentDateTime())
                    .status(PresenceStatus.ABSENT)
                    .message("Aucun pointage d'entree n'a ete detecte apres votre heure planifiee.")
                    .build();
            notificationService.notifyUser(user.getId(), employeeNotification);

            if (user.getManagerId() != null) {
                notificationService.notifyManager(
                        user.getManagerId(),
                        PresenceNotificationDTO.builder()
                                .title("Pointage d'entree manquant")
                                .actor("Attendance automation")
                                .audience("MANAGER")
                                .category("presence")
                                .priority("high")
                                .channel("push")
                                .managerId(user.getManagerId())
                                .userId(user.getId())
                                .entrepriseId(user.getEntrepriseId())
                                .fullName(fullName)
                                .departement(user.getDepartement())
                                .equipe(user.getEquipe())
                                .date(date)
                                .eventTime(currentDateTime())
                                .status(PresenceStatus.ABSENT)
                                .message("Aucun pointage d'entree detecte pour " + fullName + ".")
                                .build()
                );
            }
        } catch (Exception exception) {
            log.warn("Could not dispatch missing-checkin notification: {}", exception.getMessage());
        }
    }

    private List<String> buildImpactedUsers(List<UserSummaryDTO> users) {
        return (users == null ? List.<UserSummaryDTO>of() : users).stream()
                .map(this::resolveFullName)
                .filter(Objects::nonNull)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    private boolean hasApprovedLeave(Long utilisateurId, LocalDate date) {
        if (utilisateurId == null || date == null) return false;
        String key = utilisateurId + "_" + date;
        CacheEntry<Boolean> entry = leaveCache.get(key);
        if (entry != null && !entry.isExpired(CACHE_TTL_MS)) {
            return entry.value;
        }
        try {
            boolean result = Boolean.TRUE.equals(rhServiceFeignClientWrapper.callHasApprovedLeave(utilisateurId, date));
            leaveCache.put(key, new CacheEntry<>(result));
            return result;
        } catch (Exception exception) {
            log.warn("Leave service unavailable for user {} on {}: {}", utilisateurId, date, exception.getMessage());
            return false;
        }
    }

    private boolean hasApprovedTelework(Long utilisateurId, LocalDate date) {
        if (utilisateurId == null || date == null) return false;
        String key = utilisateurId + "_" + date;
        CacheEntry<Boolean> entry = teleworkCache.get(key);
        if (entry != null && !entry.isExpired(CACHE_TTL_MS)) {
            return entry.value;
        }
        try {
            boolean result = Boolean.TRUE.equals(rhServiceFeignClientWrapper.callHasApprovedTelework(utilisateurId, date));
            teleworkCache.put(key, new CacheEntry<>(result));
            return result;
        } catch (Exception exception) {
            log.warn("Telework service unavailable for user {} on {}: {}", utilisateurId, date, exception.getMessage());
            return false;
        }
    }

    private boolean isPublicHoliday(Long entrepriseId, LocalDate date) {
        if (entrepriseId == null || date == null) {
            return false;
        }
        String key = entrepriseId + "_" + date;
        CacheEntry<Boolean> entry = holidayCache.get(key);
        if (entry != null && !entry.isExpired(CACHE_TTL_MS)) {
            return entry.value;
        }
        try {
            boolean result = Boolean.TRUE.equals(rhServiceFeignClientWrapper.callIsPublicHoliday(entrepriseId, date));
            holidayCache.put(key, new CacheEntry<>(result));
            return result;
        } catch (Exception exception) {
            log.warn("Holiday service unavailable for enterprise {} on {}: {}", entrepriseId, date, exception.getMessage());
            return false;
        }
    }

    private PresenceStatus mapTeamStatus(AttendanceDayStatus status) {
        return switch (status) {
            case WORKING, IDLE, PARTIAL, EARLY_LEAVE, AUTO_CLOSED, MISSING_CHECKOUT, OUT_OF_ZONE -> PresenceStatus.PRESENT;
            case LATE -> PresenceStatus.LATE;
            case REMOTE -> PresenceStatus.REMOTE;
            case ON_LEAVE, HOLIDAY -> PresenceStatus.ON_LEAVE;
            case ABSENT -> PresenceStatus.ABSENT;
        };
    }

    private BigDecimal toHours(long durationSeconds) {
        return BigDecimal.valueOf(durationSeconds)
                .divide(BigDecimal.valueOf(3600L), 2, RoundingMode.HALF_UP);
    }

    private String formatAverageArrival(long averageSeconds) {
        return LocalTime.ofSecondOfDay(averageSeconds).toString();
    }

    private LocalDate currentDate() {
        return LocalDate.now(clock.withZone(zoneId()));
    }

    private LocalDateTime currentDateTime() {
        return LocalDateTime.now(clock.withZone(zoneId()));
    }

    private ZoneId zoneId() {
        return ZoneId.of(presenceProperties.getTimezone());
    }


    @Override
    public Map<LocalDate, TeamStatusResponse> getStatusRange(Long entrepriseId, Long teamId, LocalDate start, LocalDate end) {
        log.info("Fetching status range for enterprise {} team {} from {} to {}", entrepriseId, teamId, start, end);

        List<UserSummaryDTO> users = entrepriseId == null
                ? fetchActiveUsers()
                : filterUsersByEntreprise(fetchActiveUsers(), entrepriseId);
        if (teamId != null) {
            users = filterUsersByTeam(users, teamId);
        }

        String scope = entrepriseId == null ? "GLOBAL" : teamId != null ? "TEAM" : "COMPANY";
        return buildStatusRange(users, entrepriseId, teamId, scope, start, end);
    }

    @Override
    public Map<LocalDate, TeamStatusResponse> getCompanyStatusRange(
            Long rhUserId,
            LocalDate start,
            LocalDate end
    ) {
        if (rhUserId == null) {
            throw new IllegalStateException("Authenticated RH user not found");
        }
        UserSummaryDTO currentUser = fetchUserSummary(rhUserId);
        Long entrepriseId = currentUser != null ? currentUser.getEntrepriseId() : null;
        if (entrepriseId == null) {
            log.warn("RH user {} has no entrepriseId in organisation-service", rhUserId);
            return Collections.emptyMap();
        }
        log.info("Fetching company status range for RH {} enterprise {} from {} to {}",
                rhUserId, entrepriseId, start, end);
        return buildStatusRange(
                filterUsersByEntreprise(fetchActiveUsers(), entrepriseId),
                entrepriseId,
                null,
                "COMPANY",
                start,
                end
        );
    }

    @Override
    public Map<LocalDate, TeamStatusResponse> getTeamStatusRange(
            Long managerId,
            Long teamId,
            LocalDate start,
            LocalDate end
    ) {
        if (managerId == null) {
            throw new IllegalStateException("Authenticated manager not found");
        }
        List<UserSummaryDTO> users = filterUsersByTeam(fetchTeamMembers(managerId), teamId);
        Long entrepriseId = users.stream()
                .map(UserSummaryDTO::getEntrepriseId)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
        log.info("Fetching team status range for manager {} team {} from {} to {}",
                managerId, teamId, start, end);
        return buildStatusRange(users, entrepriseId, teamId, "TEAM", start, end);
    }

    private Map<LocalDate, TeamStatusResponse> buildStatusRange(
            List<UserSummaryDTO> users,
            Long entrepriseId,
            Long teamId,
            String scope,
            LocalDate start,
            LocalDate end
    ) {
        if (users.isEmpty()) {
            return Collections.emptyMap();
        }

        List<Long> userIds = users.stream().map(UserSummaryDTO::getId).toList();
        List<AttendanceSession> sessions = attendanceSessionRepository.findByUtilisateurIdInAndDateBetween(userIds, start, end);
        Map<LocalDate, Map<Long, List<AttendanceSession>>> sessionsByDateAndUser = sessions.stream()
                .collect(Collectors.groupingBy(AttendanceSession::getDate,
                        Collectors.groupingBy(AttendanceSession::getUtilisateurId)));

        Map<LocalDate, TeamStatusResponse> result = new LinkedHashMap<>();
        for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
            final LocalDate currentDate = date;
            Map<Long, List<AttendanceSession>> daySessionsByUser = sessionsByDateAndUser.getOrDefault(date, Collections.emptyMap());

            List<TeamStatusResponse.MemberStatus> members = users.parallelStream()
                    .map(user -> {
                        AttendanceSummaryDTO summary = buildTodaySummary(user.getId(), currentDate, daySessionsByUser.getOrDefault(user.getId(), List.of()), user, null, null, null);
                        return toMemberStatus(user, summary);
                    })
                    .toList();

            long presentMembers = members.stream().filter(m -> m.getStatus() != PresenceStatus.ABSENT).count();
            long workingMembers = members.stream().filter(m -> m.getStatus() == PresenceStatus.PRESENT && m.getHeureSortie() == null).count();
            long lateMembers = members.stream().filter(m -> m.getStatus() == PresenceStatus.LATE).count();
            long absentMembers = members.stream().filter(m -> m.getStatus() == PresenceStatus.ABSENT).count();

            result.put(date, TeamStatusResponse.builder()
                    .scope(scope)
                    .teamId(teamId)
                    .entrepriseId(entrepriseId)
                    .totalMembers(users.size())
                    .presentMembers(presentMembers)
                    .workingMembers(workingMembers)
                    .lateMembers(lateMembers)
                    .absentMembers(absentMembers)
                    .members(members)
                    .build());
        }

        return result;
    }
}
