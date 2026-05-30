package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.HolidayServiceClient;
import com.weentime.weentimeapp.client.LeaveServiceClient;
import com.weentime.weentimeapp.client.TeletravailServiceClient;
import com.weentime.weentimeapp.client.UserServiceClient;
import com.weentime.weentimeapp.config.PresenceProperties;
import com.weentime.weentimeapp.dto.AttendanceSessionDTO;
import com.weentime.weentimeapp.dto.AttendanceSummaryDTO;
import com.weentime.weentimeapp.dto.CheckInRequest;
import com.weentime.weentimeapp.dto.CheckOutRequest;
import com.weentime.weentimeapp.entity.AttendanceSession;
import com.weentime.weentimeapp.entity.WorkSchedule;
import com.weentime.weentimeapp.enums.AttendanceSessionStatus;
import com.weentime.weentimeapp.enums.PresenceSource;
import com.weentime.weentimeapp.exception.PresenceBusinessException;
import com.weentime.weentimeapp.mapper.AttendanceSessionMapper;
import com.weentime.weentimeapp.repository.AttendanceSessionRepository;
import com.weentime.weentimeapp.repository.OvertimeRepository;
import com.weentime.weentimeapp.repository.WorkScheduleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.quality.Strictness;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PresenceServiceTest {

    @Mock
    private AttendanceSessionRepository attendanceSessionRepository;
    @Mock
    private WorkScheduleRepository workScheduleRepository;
    @Mock
    private OvertimeRepository overtimeRepository;
    @Mock
    private AttendanceSessionMapper attendanceSessionMapper;
    @Mock
    private UserServiceClient userServiceClient;
    @Mock
    private NotificationService notificationService;
    @Mock
    private LeaveServiceClient leaveServiceClient;
    @Mock
    private HolidayServiceClient holidayServiceClient;
    @Mock
    private TeletravailServiceClient teletravailServiceClient;
    @Mock
    private HoraireManagementService horaireManagementService;
    @Mock
    private LocationResolverService locationResolverService;

    private PresenceServiceImpl presenceService;
    private com.weentime.weentimeapp.dto.CheckInRequest checkInRequest;
    private com.weentime.weentimeapp.dto.CheckOutRequest checkOutRequest;
    private WorkSchedule workSchedule;
    private List<AttendanceSession> storedSessions;
    private AtomicLong sessionIds;

    @BeforeEach
    void setUp() {
        PresenceProperties properties = new PresenceProperties();
        properties.setTimezone("UTC");
        properties.getDefaults().setToleranceMinutes(1440);
        properties.getDefaults().setWorkingDays(List.of(
                DayOfWeek.MONDAY,
                DayOfWeek.TUESDAY,
                DayOfWeek.WEDNESDAY,
                DayOfWeek.THURSDAY,
                DayOfWeek.FRIDAY,
                DayOfWeek.SATURDAY,
                DayOfWeek.SUNDAY
        ));

        presenceService = new PresenceServiceImpl(
                attendanceSessionRepository,
                workScheduleRepository,
                overtimeRepository,
                attendanceSessionMapper,
                leaveServiceClient,
                holidayServiceClient,
                teletravailServiceClient,
                userServiceClient,
                notificationService,
                properties,
                horaireManagementService,
                locationResolverService
        );

        checkInRequest = com.weentime.weentimeapp.dto.CheckInRequest.builder()
                .source(PresenceSource.WEB)
                .localisation("WEB")
                .build();
        checkOutRequest = com.weentime.weentimeapp.dto.CheckOutRequest.builder()
                .localisation("WEB")
                .build();

        workSchedule = WorkSchedule.builder()
                .utilisateurId(1L)
                .heureDebut(LocalTime.of(9, 0))
                .heureFin(LocalTime.of(18, 0))
                .joursTravail(EnumSet.allOf(DayOfWeek.class))
                .toleranceRetardMinutes(1440)
                .build();

        storedSessions = new ArrayList<>();
        sessionIds = new AtomicLong(1L);

        when(workScheduleRepository.findByUtilisateurId(anyLong())).thenReturn(Optional.of(workSchedule));
        when(horaireManagementService.resolveEffectiveWorkSchedule(anyLong(), any(LocalDate.class))).thenReturn(workSchedule);
        when(leaveServiceClient.hasApprovedLeave(anyLong(), any(LocalDate.class))).thenReturn(false);
        when(holidayServiceClient.isPublicHoliday(anyLong(), any(LocalDate.class))).thenReturn(false);
        when(teletravailServiceClient.hasApprovedTelework(anyLong(), any(LocalDate.class))).thenReturn(false);
        when(userServiceClient.getUserById(anyLong())).thenAnswer(invocation -> com.weentime.weentimeapp.dto.UserSummaryDTO.builder()
                .id(invocation.getArgument(0))
                .entrepriseId(1L)
                .fullName("Test User")
                .active(true)
                .build());
        when(attendanceSessionMapper.toDto(any(AttendanceSession.class))).thenAnswer(invocation -> {
            AttendanceSession session = invocation.getArgument(0);
            return AttendanceSessionDTO.builder()
                    .id(session.getId())
                    .utilisateurId(session.getUtilisateurId())
                    .entrepriseId(session.getEntrepriseId())
                    .scheduleId(session.getScheduleId())
                    .date(session.getDate())
                    .checkInTime(session.getCheckInTime())
                    .checkOutTime(session.getCheckOutTime())
                    .duration(session.getDuration())
                    .status(session.getStatus())
                    .source(session.getSource())
                    .checkInSource(session.getCheckInSource())
                    .checkOutSource(session.getCheckOutSource())
                    .localisation(session.getLocalisation())
                    .checkInLatitude(session.getCheckInLatitude())
                    .checkInLongitude(session.getCheckInLongitude())
                    .checkInAccuracy(session.getCheckInAccuracy())
                    .checkInAddress(session.getCheckInAddress())
                    .checkInLocation(locationResolverService.displayLocation(session.getCheckInAddress(), session.getCheckInLatitude(), session.getCheckInLongitude()))
                    .checkOutLatitude(session.getCheckOutLatitude())
                    .checkOutLongitude(session.getCheckOutLongitude())
                    .checkOutAccuracy(session.getCheckOutAccuracy())
                    .checkOutAddress(session.getCheckOutAddress())
                    .checkOutLocation(locationResolverService.displayLocation(session.getCheckOutAddress(), session.getCheckOutLatitude(), session.getCheckOutLongitude()))
                    .lateArrival(session.getLateArrival())
                    .dailyStatus(session.getDailyStatus())
                    .workedMinutes(session.getWorkedMinutes())
                    .expectedMinutes(session.getExpectedMinutes())
                    .overtimeMinutes(session.getOvertimeMinutes())
                    .earlyLeaveMinutes(session.getEarlyLeaveMinutes())
                    .autoClosed(session.getAutoClosed())
                    .autoClosedReason(session.getAutoClosedReason())
                    .latestAlert(session.getLatestAlert())
                    .createdAt(session.getCreatedAt())
                    .build();
        });

        when(attendanceSessionRepository.findFirstByUtilisateurIdAndStatusOrderByCheckInTimeDesc(anyLong(), any()))
                .thenAnswer(invocation -> storedSessions.stream()
                        .filter(session -> session.getUtilisateurId().equals(invocation.getArgument(0))
                                && session.getStatus() == invocation.getArgument(1))
                        .max(Comparator.comparing(AttendanceSession::getCheckInTime)));

        when(attendanceSessionRepository.findFirstByUtilisateurIdAndDateAndStatusOrderByCheckInTimeDesc(anyLong(), any(LocalDate.class), any()))
                .thenAnswer(invocation -> storedSessions.stream()
                        .filter(session -> session.getUtilisateurId().equals(invocation.getArgument(0))
                                && session.getDate().equals(invocation.getArgument(1))
                                && session.getStatus() == invocation.getArgument(2))
                        .max(Comparator.comparing(AttendanceSession::getCheckInTime)));

        when(attendanceSessionRepository.findByUtilisateurIdAndStatusOrderByCheckInTimeDesc(anyLong(), any()))
                .thenAnswer(invocation -> storedSessions.stream()
                        .filter(session -> session.getUtilisateurId().equals(invocation.getArgument(0))
                                && session.getStatus() == invocation.getArgument(1))
                        .sorted(Comparator.comparing(AttendanceSession::getCheckInTime).reversed())
                        .toList());

        when(attendanceSessionRepository.findByUtilisateurIdAndDateOrderByCheckInTimeAsc(anyLong(), any(LocalDate.class)))
                .thenAnswer(invocation -> storedSessions.stream()
                        .filter(session -> session.getUtilisateurId().equals(invocation.getArgument(0))
                                && session.getDate().equals(invocation.getArgument(1)))
                        .sorted(Comparator.comparing(AttendanceSession::getCheckInTime))
                        .toList());

        when(attendanceSessionRepository.existsByUtilisateurIdAndDate(anyLong(), any(LocalDate.class)))
                .thenAnswer(invocation -> storedSessions.stream()
                        .anyMatch(session -> session.getUtilisateurId().equals(invocation.getArgument(0))
                                && session.getDate().equals(invocation.getArgument(1))));

        when(attendanceSessionRepository.existsByUtilisateurIdAndDateAndCheckOutTimeIsNotNull(anyLong(), any(LocalDate.class)))
                .thenAnswer(invocation -> storedSessions.stream()
                        .anyMatch(session -> session.getUtilisateurId().equals(invocation.getArgument(0))
                                && session.getDate().equals(invocation.getArgument(1))
                                && session.getCheckOutTime() != null));

        when(attendanceSessionRepository.saveAndFlush(any(AttendanceSession.class))).thenAnswer(invocation -> {
            AttendanceSession session = invocation.getArgument(0);
            if (session.getId() == null) {
                session.setId(sessionIds.getAndIncrement());
                if (session.getDate() == null) {
                    session.setDate(LocalDate.now());
                }
                if (session.getCreatedAt() == null) {
                    session.setCreatedAt(LocalDateTime.now());
                }
                storedSessions.add(session);
            }
            return session;
        });
    }

    @Test
    void checkIn_createsOpenSessionSummary() {
        AttendanceSummaryDTO result = presenceService.checkIn(1L, checkInRequest);

        assertNotNull(result);
        assertEquals(1L, result.getUtilisateurId());
        assertTrue(Boolean.TRUE.equals(result.getHasOpenSession()));
        assertEquals(1, result.getSessions().size());
        assertEquals(AttendanceSessionStatus.OPEN, result.getActiveSession().getStatus());
        verify(attendanceSessionRepository).saveAndFlush(any(AttendanceSession.class));
    }

    @Test
    void checkOut_persistsClosedSessionAndDuration() {
        AttendanceSummaryDTO afterCheckIn = presenceService.checkIn(1L, checkInRequest);

        AttendanceSummaryDTO result = presenceService.checkOut(1L, checkOutRequest);

        assertTrue(Boolean.FALSE.equals(result.getHasOpenSession()));
        assertEquals(1, result.getSessions().size());
        AttendanceSessionDTO closedSession = result.getSessions().get(0);
        assertEquals(AttendanceSessionStatus.CLOSED, closedSession.getStatus());
        assertNotNull(closedSession.getCheckOutTime());
        assertTrue(closedSession.getDuration() >= 0);
        verify(attendanceSessionRepository, times(2)).saveAndFlush(any(AttendanceSession.class));
        assertNotNull(afterCheckIn.getActiveSession());
    }

    @Test
    void checkIn_rejectsDuplicateOpenSession() {
        storedSessions.add(AttendanceSession.builder()
                .id(1L)
                .utilisateurId(1L)
                .date(LocalDate.now())
                .checkInTime(LocalDateTime.now().minusHours(1))
                .status(AttendanceSessionStatus.OPEN)
                .source(PresenceSource.WEB)
                .lateArrival(false)
                .build());

        assertThrows(PresenceBusinessException.class, () -> presenceService.checkIn(1L, checkInRequest));
        verify(attendanceSessionRepository, never()).saveAndFlush(any(AttendanceSession.class));
    }

    @Test
    void checkOut_rejectsWhenNoSessionIsOpen() {
        PresenceBusinessException exception = assertThrows(
                PresenceBusinessException.class,
                () -> presenceService.checkOut(1L, checkOutRequest)
        );

        assertEquals("ATTENDANCE_SESSION_NOT_OPEN", exception.getCode());
    }

    @Test
    void checkIn_rejectsNewSessionAfterCheckoutOnSameDay() {
        AttendanceSummaryDTO firstCheckIn = presenceService.checkIn(1L, checkInRequest);
        assertTrue(Boolean.TRUE.equals(firstCheckIn.getHasOpenSession()));

        AttendanceSummaryDTO afterCheckout = presenceService.checkOut(1L, checkOutRequest);
        assertEquals(1, afterCheckout.getSessions().size());
        assertTrue(Boolean.FALSE.equals(afterCheckout.getHasOpenSession()));
        assertEquals(AttendanceSessionStatus.CLOSED, afterCheckout.getSessions().get(0).getStatus());

        assertThrows(PresenceBusinessException.class, () -> presenceService.checkIn(1L, checkInRequest));
    }
}
