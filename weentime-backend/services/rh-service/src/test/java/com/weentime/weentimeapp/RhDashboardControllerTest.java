package com.weentime.weentimeapp;

import com.weentime.weentimeapp.controller.RhDashboardCompatibilityController;
import com.weentime.weentimeapp.dto.RhDashboardDTO;
import com.weentime.weentimeapp.exception.GlobalExceptionHandler;
import com.weentime.weentimeapp.service.RhDashboardService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(RhDashboardCompatibilityController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class RhDashboardControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RhDashboardService rhDashboardService;

    @Test
    @WithMockUser(roles = "RH")
    void getDashboardReturnsAggregatedPayload() throws Exception {
        when(rhDashboardService.getDashboard()).thenReturn(
                RhDashboardDTO.builder()
                        .totalEmployees(12)
                        .presentCount(9)
                        .absentCount(3)
                        .hoursWorked(new BigDecimal("63.50"))
                        .attendanceRate(75.0)
                        .pendingRequests(List.of(
                                RhDashboardDTO.DashboardLeaveRequestDTO.builder()
                                        .id(18L)
                                        .userId(4L)
                                        .type("Conges")
                                        .startDate(LocalDate.parse("2026-04-18"))
                                        .endDate(LocalDate.parse("2026-04-20"))
                                        .status("EN_ATTENTE_RH")
                                        .validatedBy(2L)
                                        .employeeName("Ada Lovelace")
                                        .build()
                        ))
                        .attendanceStats(RhDashboardDTO.AttendanceStats.builder()
                                .present(9)
                                .absent(3)
                                .remote(1)
                                .build())
                        .requestStats(RhDashboardDTO.RequestStats.builder()
                                .leave(5)
                                .autorisation(2)
                                .teletravail(4)
                                .build())
                        .highlightedEmployees(List.of(
                                RhDashboardDTO.DashboardEmployeeDTO.builder()
                                        .id(4L)
                                        .firstName("Ada")
                                        .lastName("Lovelace")
                                        .email("ada@weentime.io")
                                        .role("EMPLOYEE")
                                        .department("Engineering")
                                        .status("ABSENT")
                                        .team("Platform")
                                        .build()
                        ))
                        .recentActivities(List.of(
                                RhDashboardDTO.DashboardActivityDTO.builder()
                                        .id("demande-18")
                                        .title("Ada Lovelace")
                                        .description("Ada Lovelace a une conge approuvee.")
                                        .date(LocalDateTime.parse("2026-04-17T10:15:00"))
                                        .type("CONGE")
                                        .route("/app/rh/requests")
                                        .build()
                        ))
                        .build()
        );

        mockMvc.perform(get("/api/v1/rh/dashboard"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalEmployees").value(12))
                .andExpect(jsonPath("$.data.presentCount").value(9))
                .andExpect(jsonPath("$.data.pendingRequests[0].employeeName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.data.attendanceStats.remote").value(1))
                .andExpect(jsonPath("$.data.recentActivities[0].route").value("/app/rh/requests"));
    }
}
