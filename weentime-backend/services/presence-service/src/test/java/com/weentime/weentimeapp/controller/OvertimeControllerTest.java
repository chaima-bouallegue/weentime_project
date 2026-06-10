package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.OvertimeDTO;
import com.weentime.weentimeapp.dto.response.ApiResponse;
import com.weentime.weentimeapp.entity.Overtime;
import com.weentime.weentimeapp.enums.OvertimeStatus;
import com.weentime.weentimeapp.mapper.OvertimeMapper;
import com.weentime.weentimeapp.repository.OvertimeRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.client.UserServiceClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class OvertimeControllerTest {

    @Mock
    private OvertimeRepository overtimeRepository;
    @Mock
    private SecurityUtils securityUtils;
    @Mock
    private UserServiceClient userServiceClient;

    private OvertimeController controller;

    @BeforeEach
    void setUp() {
        controller = new OvertimeController(
                overtimeRepository,
                new OvertimeMapper(),
                securityUtils,
                userServiceClient
        );
    }

    @Test
    void myOvertime_returnsCurrentUserRequests() {
        when(securityUtils.getCurrentUserId()).thenReturn(2L);
        Overtime overtime = Overtime.builder()
                .id(9L)
                .utilisateurId(2L)
                .entrepriseId(1L)
                .date(LocalDate.of(2026, 5, 31))
                .heuresSupplementaires(BigDecimal.valueOf(0.50))
                .overtimeMinutes(30)
                .status(OvertimeStatus.PENDING_MANAGER)
                .approuvee(false)
                .build();
        when(overtimeRepository.findByUtilisateurIdOrderByDateDesc(eq(2L), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(overtime)));

        ResponseEntity<ApiResponse<Page<OvertimeDTO>>> response = controller.getMyOvertime(0, 10);

        Page<OvertimeDTO> page = response.getBody() != null ? response.getBody().getData() : null;
        assertNotNull(page);
        assertEquals(1, page.getTotalElements());
        assertEquals(2L, page.getContent().get(0).getUtilisateurId());
    }

    @Test
    void managerPending_returnsRealOvertimeRequests() {
        when(securityUtils.getCurrentEntrepriseId()).thenReturn(1L);
        Overtime overtime = Overtime.builder()
                .id(10L)
                .utilisateurId(2L)
                .entrepriseId(1L)
                .attendanceId(99L)
                .date(LocalDate.of(2026, 5, 31))
                .heuresSupplementaires(BigDecimal.valueOf(0.75))
                .overtimeMinutes(45)
                .status(OvertimeStatus.EN_ATTENTE_MANAGER)
                .approuvee(false)
                .build();
        when(overtimeRepository.findByEntrepriseIdAndStatusInOrderByDateDesc(eq(1L), anyCollection(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(overtime)));

        ResponseEntity<ApiResponse<Page<OvertimeDTO>>> response = controller.getPendingOvertime(0, 10);

        Page<OvertimeDTO> page = response.getBody() != null ? response.getBody().getData() : null;
        assertNotNull(page);
        assertEquals(1, page.getTotalElements());
        assertEquals(99L, page.getContent().get(0).getAttendanceId());
        assertEquals(45, page.getContent().get(0).getOvertimeMinutes());
    }

    @Test
    void rhStats_readsOnlyPersistedOvertimeRequests() {
        when(securityUtils.getCurrentEntrepriseId()).thenReturn(1L);
        when(overtimeRepository.sumOvertimeMinutesByEntrepriseAndDateBetween(eq(1L), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(45L);
        when(overtimeRepository.countByEntrepriseIdAndStatusIn(eq(1L), anyCollection()))
                .thenReturn(1L);

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.stats(2026, 5);

        Map<String, Object> stats = response.getBody() != null ? response.getBody().getData() : null;
        assertNotNull(stats);
        assertEquals(45L, stats.get("totalOvertimeMinutes"));
        assertEquals(BigDecimal.valueOf(0.75).setScale(2), stats.get("totalOvertimeHours"));
        assertEquals(3L, stats.get("totalRequests"));
    }

    @Test
    void rhPending_returnsRhStageRequests() {
        when(securityUtils.getCurrentEntrepriseId()).thenReturn(1L);
        Overtime overtime = Overtime.builder()
                .id(11L)
                .utilisateurId(2L)
                .entrepriseId(1L)
                .date(LocalDate.of(2026, 5, 31))
                .heuresSupplementaires(BigDecimal.valueOf(0.50))
                .overtimeMinutes(30)
                .status(OvertimeStatus.PENDING_RH)
                .approuvee(false)
                .build();
        when(overtimeRepository.findByEntrepriseIdAndStatusInOrderByDateDesc(eq(1L), anyCollection(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(overtime)));

        ResponseEntity<ApiResponse<Page<OvertimeDTO>>> response = controller.getRhPending(0, 10);

        Page<OvertimeDTO> page = response.getBody() != null ? response.getBody().getData() : null;
        assertNotNull(page);
        assertEquals(1, page.getTotalElements());
        assertEquals(OvertimeStatus.PENDING_RH, page.getContent().get(0).getStatus());
    }

    @Test
    void managerDecision_approveMovesRequestToRhPending() {
        when(securityUtils.getCurrentUserId()).thenReturn(7L);
        when(securityUtils.getCurrentEntrepriseId()).thenReturn(1L);
        Overtime overtime = Overtime.builder()
                .id(12L)
                .utilisateurId(2L)
                .entrepriseId(1L)
                .date(LocalDate.of(2026, 5, 31))
                .heuresSupplementaires(BigDecimal.valueOf(0.50))
                .overtimeMinutes(30)
                .status(OvertimeStatus.PENDING_MANAGER)
                .approuvee(false)
                .build();
        when(overtimeRepository.findById(12L)).thenReturn(java.util.Optional.of(overtime));
        when(overtimeRepository.save(any(Overtime.class))).thenAnswer(invocation -> invocation.getArgument(0));
        OvertimeController.DecisionRequest request = new OvertimeController.DecisionRequest();
        request.setDecision("APPROVED");
        request.setComment("ok");

        controller.managerDecision(12L, request);

        ArgumentCaptor<Overtime> captor = ArgumentCaptor.forClass(Overtime.class);
        verify(overtimeRepository).save(captor.capture());
        assertEquals(OvertimeStatus.PENDING_RH, captor.getValue().getStatus());
        assertEquals("APPROVED", captor.getValue().getManagerDecision());
        assertEquals("ok", captor.getValue().getManagerComment());
    }

    @Test
    void rhDecision_approveFinalizesRequest() {
        when(securityUtils.getCurrentUserId()).thenReturn(8L);
        when(securityUtils.getCurrentEntrepriseId()).thenReturn(1L);
        Overtime overtime = Overtime.builder()
                .id(13L)
                .utilisateurId(2L)
                .entrepriseId(1L)
                .date(LocalDate.of(2026, 5, 31))
                .heuresSupplementaires(BigDecimal.valueOf(0.50))
                .overtimeMinutes(30)
                .status(OvertimeStatus.PENDING_RH)
                .approuvee(false)
                .build();
        when(overtimeRepository.findById(13L)).thenReturn(java.util.Optional.of(overtime));
        when(overtimeRepository.save(any(Overtime.class))).thenAnswer(invocation -> invocation.getArgument(0));
        OvertimeController.DecisionRequest request = new OvertimeController.DecisionRequest();
        request.setDecision("APPROVED");
        request.setComment("final ok");

        controller.rhDecision(13L, request);

        ArgumentCaptor<Overtime> captor = ArgumentCaptor.forClass(Overtime.class);
        verify(overtimeRepository).save(captor.capture());
        assertEquals(OvertimeStatus.APPROVED_RH, captor.getValue().getStatus());
        assertEquals("APPROVED", captor.getValue().getRhDecision());
        assertEquals("final ok", captor.getValue().getRhComment());
        assertEquals(Boolean.TRUE, captor.getValue().getApprouvee());
    }
}
