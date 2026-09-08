package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.RhDashboardDTO;
import com.weentime.weentimeapp.service.RhDashboardService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RhDashboardCompatibilityControllerTest {

    @Mock
    private RhDashboardService rhDashboardService;

    private RhDashboardCompatibilityController controller;

    @BeforeEach
    void setUp() {
        controller = new RhDashboardCompatibilityController(rhDashboardService);
    }

    @Test
    void getDemandesByTypeReturnsCorrectMap() {
        RhDashboardDTO dashboard = new RhDashboardDTO();
        dashboard.setRequestStats(RhDashboardDTO.RequestStats.builder()
                .leave(5)
                .autorisation(3)
                .teletravail(7)
                .build());
        when(rhDashboardService.getDashboard()).thenReturn(dashboard);

        ResponseEntity<ApiResponse<Map<String, Long>>> response = controller.getDemandesByType();

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).isNotNull();
        Map<String, Long> data = response.getBody().getData();
        assertThat(data)
                .containsEntry("CONGE", 5L)
                .containsEntry("AUTORISATION", 3L)
                .containsEntry("TELETRAVAIL", 7L);
    }

    @Test
    void getStatsOverviewReturnsCompletePayloadWithoutNpe() {
        RhDashboardDTO dashboard = new RhDashboardDTO();
        dashboard.setTotalEmployees(10);
        dashboard.setPresentCount(8);
        dashboard.setAbsentCount(2);
        dashboard.setHoursWorked(BigDecimal.valueOf(160));
        dashboard.setRequestStats(RhDashboardDTO.RequestStats.builder()
                .leave(2)
                .autorisation(1)
                .teletravail(4)
                .build());
        when(rhDashboardService.getDashboard()).thenReturn(dashboard);

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.getStatsOverview();

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).isNotNull();
        Map<String, Object> data = response.getBody().getData();
        assertThat(data)
                .isNotNull()
                .containsEntry("totalEmployees", 10L)
                .containsEntry("presentToday", 8L)
                .containsEntry("absentToday", 2L);

        @SuppressWarnings("unchecked")
        Map<String, Long> requestDistribution = (Map<String, Long>) data.get("requestTypeDistribution");
        assertThat(requestDistribution)
                .isNotNull()
                .containsEntry("CONGE", 2L)
                .containsEntry("AUTORISATION", 1L)
                .containsEntry("TELETRAVAIL", 4L);
    }

    @Test
    void getDashboardAndMonthlyEvolution() {
        when(rhDashboardService.getDashboard()).thenReturn(null);

        ResponseEntity<ApiResponse<RhDashboardDTO>> dashRes = controller.getDashboard();
        assertThat(dashRes.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(dashRes.getBody().getData()).isNotNull();

        ResponseEntity<ApiResponse<Map<Integer, Long>>> evoRes = controller.getMonthlyEvolution();
        assertThat(evoRes.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(evoRes.getBody().getData()).isNotEmpty();
    }

    @Test
    void getStatsOverviewWithZeroEmployeesAndHighlightedEmployees() {
        RhDashboardDTO dashboard = new RhDashboardDTO();
        dashboard.setTotalEmployees(0);
        dashboard.setPendingRequests(List.of(new RhDashboardDTO.DashboardLeaveRequestDTO()));
        dashboard.setHighlightedEmployees(List.of(
                RhDashboardDTO.DashboardEmployeeDTO.builder().status("ON_LEAVE").build(),
                RhDashboardDTO.DashboardEmployeeDTO.builder().status("PRESENT").build()
        ));
        when(rhDashboardService.getDashboard()).thenReturn(dashboard);

        ResponseEntity<ApiResponse<Map<String, Object>>> response = controller.getStatsOverview();
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        Map<String, Object> data = response.getBody().getData();
        assertThat(data)
                .containsEntry("absenceRate", 0d)
                .containsEntry("pendingRequests", 1)
                .containsEntry("employeesOnLeave", 1L);
    }
}
