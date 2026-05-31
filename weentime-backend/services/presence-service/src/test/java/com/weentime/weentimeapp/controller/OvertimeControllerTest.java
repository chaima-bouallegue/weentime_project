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
}
