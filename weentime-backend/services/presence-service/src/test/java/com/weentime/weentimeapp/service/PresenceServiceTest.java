package com.weentime.weentimeapp.service;

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
    private TeletravailServiceClient teletravailServiceClient;
    @Mock
    private HoraireManagementService horaireManagementService;

    private PresenceServiceImpl presenceService;
    private CheckInRequest checkInRequest;
    private CheckOutRequest checkOutRequest;
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
                teletravailServiceClient,
                userServiceClient,
                notificationService,
                properties,
                horaireManagementService
        );

        checkInRequest = CheckInRequest.builder()
                .source(PresenceSource.WEB)
                .localisation("WEB")
                .build();
        checkOutRequest = CheckOutRequest.builder()
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
        when(leaveServiceClient.hasApprovedLeave(anyLong(), any(LocalDate.class))).thenReturn(false);
        when(teletravailServiceClient.hasApprovedTelework(anyLong(), any(LocalDate.class))).thenReturn(false);
        when(attendanceSessionMapper.toDto(any(AttendanceSession.class))).thenAnswer(invocation -> {
            AttendanceSession session = invocation.getArgument(0);
            return AttendanceSessionDTO.builder()
                    .id(session.getId())
                    .utilisateurId(session.getUtilisateurId())
                    .date(session.getDate())
                    .checkInTime(session.getCheckInTime())
                    .checkOutTime(session.getCheckOutTime())
                    .duration(session.getDuration())
                    .status(session.getStatus())
                    .source(session.getSource())
                    .localisation(session.getLocalisation())
                    .lateArrival(session.getLateArrival())
                    .dailyStatus(session.getDailyStatus())
                    .createdAt(session.getCreatedAt())
                    .build();
        });

        when(attendanceSessionRepository.findFirstByUtilisateurIdAndStatusOrderByCheckInTimeDesc(anyLong(), any()))
                .thenAnswer(invocation -> storedSessions.stream()
                        .filter(session -> session.getUtilisateurId().equals(invocation.getArgument(0))
                                && session.getStatus() == invocation.getArgument(1))
                        .max(Comparator.comparing(AttendanceSession::getCheckInTime)));

        when(attendanceSessionRepository.findByUtilisateurIdAndDateOrderByCheckInTimeAsc(anyLong(), any(LocalDate.class)))
                .thenAnswer(invocation -> storedSessions.stream()
                        .filter(session -> session.getUtilisateurId().equals(invocation.getArgument(0))
                                && session.getDate().equals(invocation.getArgument(1)))
                        .sorted(Comparator.comparing(AttendanceSession::getCheckInTime))
                        .toList());

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
    void checkIn_returnsExistingOpenSessionWithoutCreatingNewOne() {
        storedSessions.add(AttendanceSession.builder()
                .id(1L)
                .utilisateurId(1L)
                .date(LocalDate.now())
                .checkInTime(LocalDateTime.now().minusHours(1))
                .status(AttendanceSessionStatus.OPEN)
                .source(PresenceSource.WEB)
                .lateArrival(false)
                .build());

        AttendanceSummaryDTO summary = presenceService.checkIn(1L, checkInRequest);

        assertNotNull(summary);
        assertTrue(Boolean.TRUE.equals(summary.getHasOpenSession()));
        assertNotNull(summary.getActiveSession());
        assertEquals(1L, summary.getActiveSession().getId());
        assertEquals(AttendanceSessionStatus.OPEN, summary.getActiveSession().getStatus());
        assertEquals(1, summary.getSessions().size());
        verify(attendanceSessionRepository, never()).saveAndFlush(any(AttendanceSession.class));
    }

    @Test
    void checkOut_rejectsWhenNoSessionIsOpen() {
        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> presenceService.checkOut(1L, checkOutRequest)
        );

        assertEquals("No open attendance session found for checkout.", exception.getMessage());
    }

    @Test
    void checkIn_allowsNewSessionAfterCheckoutOnSameDay() {
        AttendanceSummaryDTO firstCheckIn = presenceService.checkIn(1L, checkInRequest);
        assertTrue(Boolean.TRUE.equals(firstCheckIn.getHasOpenSession()));

        AttendanceSummaryDTO afterCheckout = presenceService.checkOut(1L, checkOutRequest);
        assertEquals(1, afterCheckout.getSessions().size());
        assertTrue(Boolean.FALSE.equals(afterCheckout.getHasOpenSession()));
        assertEquals(AttendanceSessionStatus.CLOSED, afterCheckout.getSessions().get(0).getStatus());

        AttendanceSummaryDTO secondCheckIn = presenceService.checkIn(1L, checkInRequest);

        assertEquals(2, secondCheckIn.getSessions().size());
        assertTrue(Boolean.TRUE.equals(secondCheckIn.getHasOpenSession()));
        assertNotNull(secondCheckIn.getActiveSession());
        assertEquals(AttendanceSessionStatus.OPEN, secondCheckIn.getActiveSession().getStatus());
    }
}
