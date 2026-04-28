package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.LeaveServiceClient;
import com.weentime.weentimeapp.client.TeletravailServiceClient;
import com.weentime.weentimeapp.client.UserServiceClient;
import com.weentime.weentimeapp.config.PresenceProperties;
import com.weentime.weentimeapp.dto.AttendanceSessionDTO;
import com.weentime.weentimeapp.dto.AttendanceSessionViewDTO;
import com.weentime.weentimeapp.dto.AttendanceSummaryDTO;
import com.weentime.weentimeapp.dto.CheckInRequest;
import com.weentime.weentimeapp.dto.CheckOutRequest;
import com.weentime.weentimeapp.dto.GlobalPresenceAnalyticsDTO;
import com.weentime.weentimeapp.dto.PresenceNotificationDTO;
import com.weentime.weentimeapp.dto.PresenceStatsDTO;
import com.weentime.weentimeapp.dto.TeamStatusResponse;
import com.weentime.weentimeapp.dto.UserSummaryDTO;
import com.weentime.weentimeapp.entity.AttendanceSession;
import com.weentime.weentimeapp.entity.Overtime;
import com.weentime.weentimeapp.entity.WorkSchedule;
import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.AttendanceSessionStatus;
import com.weentime.weentimeapp.enums.PresenceSource;
import com.weentime.weentimeapp.enums.PresenceStatus;
import com.weentime.weentimeapp.mapper.AttendanceSessionMapper;
import com.weentime.weentimeapp.repository.AttendanceSessionRepository;
import com.weentime.weentimeapp.repository.OvertimeRepository;
import com.weentime.weentimeapp.repository.WorkScheduleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
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
    private final LeaveServiceClient leaveServiceClient;
    private final TeletravailServiceClient teletravailServiceClient;
    private final UserServiceClient userServiceClient;
    private final NotificationService notificationService;
    private final PresenceProperties presenceProperties;
    private final HoraireManagementService horaireManagementService;

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

        log.info("Starting check-in for user {} on {}", utilisateurId, currentDate());

        Optional<AttendanceSession> openSession = attendanceSessionRepository
                .findFirstByUtilisateurIdAndStatusOrderByCheckInTimeDesc(utilisateurId, AttendanceSessionStatus.OPEN);
        if (openSession.isPresent()) {
            AttendanceSession existingSession = openSession.get();
            LocalDate sessionDate = existingSession.getDate() != null ? existingSession.getDate() : currentDate();
            log.info(
                    "Idempotent check-in for user {}: returning existing open session {} from {}",
                    utilisateurId,
                    existingSession.getId(),
                    sessionDate
            );
            return buildTodaySummary(
                    utilisateurId,
                    sessionDate,
                    attendanceSessionRepository.findByUtilisateurIdAndDateOrderByCheckInTimeAsc(utilisateurId, sessionDate)
            );
        }

        LocalDate today = currentDate();
        if (hasApprovedLeave(utilisateurId, today)) {
            log.warn("Check-in rejected for user {} because an approved leave exists on {}", utilisateurId, today);
            throw new IllegalStateException("Cannot check in while an approved leave is active.");
        }

        List<AttendanceSession> todaySessions = attendanceSessionRepository
                .findByUtilisateurIdAndDateOrderByCheckInTimeAsc(utilisateurId, today);
        WorkSchedule schedule = resolveSchedule(utilisateurId, today);
        LocalDateTime now = currentDateTime();
        boolean lateArrival = todaySessions.isEmpty() && isLateArrival(schedule, now, today);

        AttendanceSession session = AttendanceSession.builder()
                .utilisateurId(utilisateurId)
                .date(today)
                .checkInTime(now)
                .duration(0L)
                .status(AttendanceSessionStatus.OPEN)
                .source(safeRequest.getSource())
                .localisation(safeRequest.getLocalisation())
                .lateArrival(lateArrival)
                .dailyStatus(lateArrival ? AttendanceDayStatus.LATE : AttendanceDayStatus.WORKING)
                .build();

        AttendanceSession savedSession = attendanceSessionRepository.saveAndFlush(session);
        log.info(
                "Check-in persisted for user {} with session {} at {}",
                utilisateurId,
                savedSession.getId(),
                savedSession.getCheckInTime()
        );
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

        AttendanceSession openSession = attendanceSessionRepository
                .findFirstByUtilisateurIdAndStatusOrderByCheckInTimeDesc(utilisateurId, AttendanceSessionStatus.OPEN)
                .orElseThrow(() -> {
                    log.warn("Check-out rejected for user {} because no open session exists", utilisateurId);
                    return new IllegalStateException("No open attendance session found for checkout.");
                });

        LocalDateTime now = currentDateTime();
        long duration = Duration.between(openSession.getCheckInTime(), now).getSeconds();
        if (duration < 0) {
            throw new IllegalArgumentException("Checkout time cannot be earlier than check-in time.");
        }

        openSession.setCheckOutTime(now);
        openSession.setDuration(duration);
        openSession.setLocalisation(safeRequest.getLocalisation());
        openSession.setStatus(AttendanceSessionStatus.CLOSED);
        openSession.setDailyStatus(Boolean.TRUE.equals(openSession.getLateArrival()) ? AttendanceDayStatus.LATE : AttendanceDayStatus.IDLE);

        attendanceSessionRepository.saveAndFlush(openSession);
        log.info(
                "Check-out persisted for user {} with session {} at {} after {} seconds",
                utilisateurId,
                openSession.getId(),
                openSession.getCheckOutTime(),
                duration
        );
        refreshOvertime(utilisateurId, openSession.getDate());

        return buildTodaySummary(
                utilisateurId,
                openSession.getDate(),
                attendanceSessionRepository.findByUtilisateurIdAndDateOrderByCheckInTimeAsc(utilisateurId, openSession.getDate())
        );
    }

    @Override
    public AttendanceSummaryDTO getTodayAttendance(Long utilisateurId) {
        if (utilisateurId == null) {
            throw new IllegalStateException("Authenticated user not found");
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

        for (UserSummaryDTO user : activeUsers) {
            AttendanceSummaryDTO summary = buildTodaySummary(user.getId(), today, sessionsByUser.getOrDefault(user.getId(), List.of()));
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
            throw new IllegalStateException("Authenticated user not found");
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

        for (LocalDate date = weekStart; !date.isAfter(weekEnd); date = date.plusDays(1)) {
            WorkSchedule schedule = resolveSchedule(utilisateurId, date);
            if (!isWorkingDay(schedule, date)) {
                continue;
            }

            List<AttendanceSession> sessions = sessionsByDate.getOrDefault(date, List.of());
            if (!sessions.isEmpty()) {
                totalPresent++;
                AttendanceSession firstSession = sessions.stream()
                        .min(Comparator.comparing(AttendanceSession::getCheckInTime))
                        .orElse(null);
                if (firstSession != null) {
                    arrivalSecondsTotal += firstSession.getCheckInTime().toLocalTime().toSecondOfDay();
                    arrivalDays++;
                    if (Boolean.TRUE.equals(firstSession.getLateArrival())) {
                        lateCount++;
                    } else {
                        onTimeCount++;
                    }
                }
                workedSeconds += sumSessionDurations(sessions);
                continue;
            }

            if (hasApprovedLeave(utilisateurId, date)) {
                continue;
            }

            if (hasApprovedTelework(utilisateurId, date)) {
                totalPresent++;
                onTimeCount++;
                continue;
            }

            totalAbsent++;
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

        List<UserSummaryDTO> absentUsers = activeUsers.stream()
                .filter(user -> buildTodaySummary(
                        user.getId(),
                        today,
                        sessionsByUser.getOrDefault(user.getId(), List.of())
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

    private AttendanceSummaryDTO buildTodaySummary(Long utilisateurId, LocalDate date, List<AttendanceSession> rawSessions) {
        if (utilisateurId == null) {
            throw new IllegalStateException("Authenticated user not found");
        }
        LocalDate effectiveDate = date != null ? date : currentDate();
        List<AttendanceSession> sessions = (rawSessions == null ? List.<AttendanceSession>of() : rawSessions).stream()
                .sorted(Comparator.comparing(AttendanceSession::getCheckInTime))
                .toList();
        AttendanceSession activeSession = sessions.stream()
                .filter(session -> session.getStatus() == AttendanceSessionStatus.OPEN)
                .findFirst()
                .orElse(null);
        boolean hasSessions = !sessions.isEmpty();
        boolean lateArrival = sessions.stream().anyMatch(session -> Boolean.TRUE.equals(session.getLateArrival()));
        long totalDuration = sumSessionDurations(sessions);

        LocalDateTime firstCheckIn = sessions.stream()
                .map(AttendanceSession::getCheckInTime)
                .filter(Objects::nonNull)
                .min(LocalDateTime::compareTo)
                .orElse(null);
        LocalDateTime lastCheckOut = sessions.stream()
                .map(AttendanceSession::getCheckOutTime)
                .filter(Objects::nonNull)
                .max(LocalDateTime::compareTo)
                .orElse(null);

        AttendanceDayStatus status;
        if (activeSession != null) {
            status = lateArrival ? AttendanceDayStatus.LATE : AttendanceDayStatus.WORKING;
        } else if (hasSessions) {
            status = lateArrival ? AttendanceDayStatus.LATE : AttendanceDayStatus.IDLE;
        } else if (hasApprovedLeave(utilisateurId, effectiveDate)) {
            status = AttendanceDayStatus.ON_LEAVE;
        } else if (hasApprovedTelework(utilisateurId, effectiveDate)) {
            status = AttendanceDayStatus.REMOTE;
        } else {
            status = AttendanceDayStatus.ABSENT;
        }

        return AttendanceSummaryDTO.builder()
                .utilisateurId(utilisateurId)
                .date(effectiveDate)
                .status(status)
                .lateArrival(lateArrival)
                .hasOpenSession(activeSession != null)
                .totalDuration(totalDuration)
                .heureEntree(firstCheckIn)
                .heureSortie(lastCheckOut)
                .source(activeSession != null ? activeSession.getSource() : (hasSessions ? sessions.get(0).getSource() : null))
                .activeSession(activeSession != null ? toSessionDto(activeSession) : null)
                .sessions(sessions.stream().map(this::toSessionDto).toList())
                .build();
    }

    private TeamStatusResponse buildOverview(String scope, Long teamId, List<UserSummaryDTO> users) {
        if (users == null || users.isEmpty()) {
            return emptyOverview(scope, teamId, null);
        }

        LocalDate today = currentDate();
        Map<Long, List<AttendanceSession>> sessionsByUser = attendanceSessionRepository
                .findByUtilisateurIdInAndDate(users.stream().map(UserSummaryDTO::getId).toList(), today)
                .stream()
                .collect(Collectors.groupingBy(AttendanceSession::getUtilisateurId));

        List<TeamStatusResponse.MemberStatus> members = users.stream()
                .map(user -> {
                    AttendanceSummaryDTO summary = buildTodaySummary(user.getId(), today, sessionsByUser.getOrDefault(user.getId(), List.of()));
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
                .entrepriseId(users.stream().map(UserSummaryDTO::getEntrepriseId).filter(Objects::nonNull).findFirst().orElse(null))
                .totalMembers(users.size())
                .presentMembers(presentMembers)
                .workingMembers(workingMembers)
                .lateMembers(lateMembers)
                .absentMembers(absentMembers)
                .members(members)
                .build();
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
        return TeamStatusResponse.MemberStatus.builder()
                .utilisateurId(user.getId())
                .nomComplet(resolveFullName(user))
                .status(mapTeamStatus(summary.getStatus()))
                .heureEntree(summary.getHeureEntree() != null ? summary.getHeureEntree().toLocalTime().toString() : null)
                .heureSortie(summary.getHeureSortie() != null ? summary.getHeureSortie().toLocalTime().toString() : null)
                .durationSeconds(summary.getTotalDuration())
                .lateArrival(summary.getLateArrival())
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

        for (UserSummaryDTO user : users) {
            AttendanceSummaryDTO summary = buildTodaySummary(user.getId(), dateTo, sessionsByUser.getOrDefault(user.getId(), List.of()));
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

    private UserSummaryDTO fetchUserSummary(Long userId) {
        try {
            return userServiceClient.getUserById(userId);
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
                .build();
    }

    private AttendanceSessionDTO toSessionDto(AttendanceSession session) {
        AttendanceSessionDTO dto = attendanceSessionMapper.toDto(session);
        dto.setDuration(calculateSessionDuration(session));
        return dto;
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
        if (session.getStatus() == AttendanceSessionStatus.OPEN || session.getCheckOutTime() == null) {
            return Math.max(Duration.between(session.getCheckInTime(), currentDateTime()).getSeconds(), 0);
        }
        return session.getDuration() != null ? session.getDuration() : 0L;
    }

    private void refreshOvertime(Long utilisateurId, LocalDate date) {
        WorkSchedule schedule = resolveSchedule(utilisateurId, date);
        List<AttendanceSession> sessions = attendanceSessionRepository.findByUtilisateurIdAndDateOrderByCheckInTimeAsc(utilisateurId, date);
        long actualSeconds = sumSessionDurations(sessions);
        long expectedSeconds = isWorkingDay(schedule, date)
                ? Duration.between(schedule.getHeureDebut(), schedule.getHeureFin()).getSeconds()
                : 0L;
        long overtimeSeconds = Math.max(actualSeconds - expectedSeconds, 0L);

        if (overtimeSeconds <= 0) {
            overtimeRepository.deleteByUtilisateurIdAndDate(utilisateurId, date);
            return;
        }

        BigDecimal overtimeHours = BigDecimal.valueOf(overtimeSeconds)
                .divide(BigDecimal.valueOf(3600L), 2, RoundingMode.HALF_UP);

        Overtime overtime = overtimeRepository.findByUtilisateurIdAndDate(utilisateurId, date)
                .orElseGet(() -> Overtime.builder()
                        .utilisateurId(utilisateurId)
                        .date(date)
                        .approuvee(Boolean.FALSE)
                        .build());

        overtime.setHeuresSupplementaires(overtimeHours);
        overtimeRepository.save(overtime);
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

    private List<String> buildImpactedUsers(List<UserSummaryDTO> users) {
        return (users == null ? List.<UserSummaryDTO>of() : users).stream()
                .map(this::resolveFullName)
                .filter(Objects::nonNull)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    private boolean hasApprovedLeave(Long utilisateurId, LocalDate date) {
        try {
            return Boolean.TRUE.equals(leaveServiceClient.hasApprovedLeave(utilisateurId, date));
        } catch (Exception exception) {
            log.warn("Leave service unavailable for user {} on {}: {}", utilisateurId, date, exception.getMessage());
            return false;
        }
    }

    private boolean hasApprovedTelework(Long utilisateurId, LocalDate date) {
        try {
            return Boolean.TRUE.equals(teletravailServiceClient.hasApprovedTelework(utilisateurId, date));
        } catch (Exception exception) {
            log.warn("Telework service unavailable for user {} on {}: {}", utilisateurId, date, exception.getMessage());
            return false;
        }
    }

    private PresenceStatus mapTeamStatus(AttendanceDayStatus status) {
        return switch (status) {
            case WORKING, IDLE -> PresenceStatus.PRESENT;
            case LATE -> PresenceStatus.LATE;
            case REMOTE -> PresenceStatus.REMOTE;
            case ON_LEAVE -> PresenceStatus.ON_LEAVE;
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
        return LocalDate.now(zoneId());
    }

    private LocalDateTime currentDateTime() {
        return LocalDateTime.now(zoneId());
    }

    private ZoneId zoneId() {
        return ZoneId.of(presenceProperties.getTimezone());
    }
}
