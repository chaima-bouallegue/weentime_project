package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.client.PresenceServiceClient;
import com.weentime.weentimeapp.client.dto.PresenceStatsClientDto;
import com.weentime.weentimeapp.client.dto.TeamStatusClientDto;
import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.CongeDTO;
import com.weentime.weentimeapp.dto.DemandeDTO;
import com.weentime.weentimeapp.dto.RhDashboardDTO;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.TypeDemandeEnum;
import com.weentime.weentimeapp.service.CongeService;
import com.weentime.weentimeapp.service.DemandeService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RhDashboardServiceImplTest {

    @Mock
    private OrganisationServiceClient organisationServiceClient;

    @Mock
    private PresenceServiceClient presenceServiceClient;

    @Mock
    private DemandeService demandeService;

    @Mock
    private CongeService congeService;

    private RhDashboardServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new RhDashboardServiceImpl(
                organisationServiceClient,
                presenceServiceClient,
                demandeService,
                congeService
        );

        Map<String, Object> details = new HashMap<>();
        details.put("entrepriseId", 13L);
        details.put("userId", 22L);

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken("essia.rh@example.com", null, List.of());
        authentication.setDetails(details);
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getDashboardReturnsStableZeroPayloadWhenSourcesAreEmptyOrUnavailable() {
        when(organisationServiceClient.findUsersByEntreprise(13L)).thenReturn(List.of());
        when(presenceServiceClient.getCompanyToday()).thenThrow(new IllegalStateException("presence unavailable"));
        when(presenceServiceClient.getCompanyStats()).thenThrow(new IllegalStateException("presence unavailable"));
        when(demandeService.getAllForEntreprise(13L)).thenReturn(List.of());
        when(congeService.getPendingForEntreprise(13L)).thenReturn(List.of());

        RhDashboardDTO dashboard = service.getDashboard();

        assertThat(dashboard.getTotalEmployees()).isZero();
        assertThat(dashboard.getPresentCount()).isZero();
        assertThat(dashboard.getAbsentCount()).isZero();
        assertThat(dashboard.getHoursWorked()).isEqualByComparingTo(BigDecimal.ZERO.setScale(2));
        assertThat(dashboard.getAttendanceRate()).isZero();
        assertThat(dashboard.getPendingRequests()).isEmpty();
        assertThat(dashboard.getHighlightedEmployees()).isEmpty();
        assertThat(dashboard.getRecentActivities()).isEmpty();
        assertThat(dashboard.getDepartmentEmployeeCounts()).isEmpty();
        assertThat(dashboard.getRequestStatusDistribution()).isEmpty();
        assertThat(dashboard.getRequestStats().getLeave()).isZero();
        assertThat(dashboard.getRequestStats().getAutorisation()).isZero();
        assertThat(dashboard.getRequestStats().getTeletravail()).isZero();
        assertThat(dashboard.getMonthlyRequestEvolution()).hasSize(12);
        assertThat(dashboard.getMonthlyRequestEvolution().values()).allMatch(count -> count == 0L);
    }

    @Test
    void getDashboardAggregatesSharedLookupBackedRequestsWithoutEnterpriseScopedTypes() {
        when(organisationServiceClient.findUsersByEntreprise(13L)).thenReturn(List.of(
                UserResponse.builder()
                        .id(22L)
                        .prenom("Essia")
                        .nom("Dupont")
                        .email("essia.rh@example.com")
                        .departementNom("RH")
                        .equipe("People")
                        .build()
        ));
        when(presenceServiceClient.getCompanyToday()).thenReturn(ApiResponse.success(
                TeamStatusClientDto.builder()
                        .presentMembers(1)
                        .absentMembers(0)
                        .members(List.of(
                                TeamStatusClientDto.MemberStatusClientDto.builder()
                                        .utilisateurId(22L)
                                        .nomComplet("Essia Dupont")
                                        .status("REMOTE")
                                        .equipe("People")
                                        .build()
                        ))
                        .build()
        ));
        when(presenceServiceClient.getCompanyStats()).thenReturn(ApiResponse.success(
                PresenceStatsClientDto.builder()
                        .totalHoursWorked(new BigDecimal("7.50"))
                        .build()
        ));
        when(demandeService.getAllForEntreprise(13L)).thenReturn(List.of(
                DemandeDTO.builder()
                        .id(100L)
                        .utilisateurId(22L)
                        .typeDemande(TypeDemandeEnum.CONGE)
                        .statut(StatutDemandeEnum.EN_ATTENTE_RH)
                        .dateCreation(LocalDateTime.of(2026, 5, 7, 9, 30))
                        .build(),
                DemandeDTO.builder()
                        .id(101L)
                        .utilisateurId(22L)
                        .typeDemande(TypeDemandeEnum.AUTORISATION)
                        .statut(StatutDemandeEnum.APPROUVE)
                        .dateCreation(LocalDateTime.of(2026, 5, 8, 11, 0))
                        .build()
        ));
        when(congeService.getPendingForEntreprise(13L)).thenReturn(List.of(
                CongeDTO.builder()
                        .id(200L)
                        .utilisateurId(22L)
                        .managerId(21L)
                        .typeCongeNom("maladie")
                        .statut(StatutDemandeEnum.EN_ATTENTE_RH)
                        .dateCreation(LocalDateTime.of(2026, 5, 9, 8, 0))
                        .dateDebut(LocalDate.of(2026, 5, 12))
                        .dateFin(LocalDate.of(2026, 5, 13))
                        .build()
        ));

        RhDashboardDTO dashboard = service.getDashboard();

        assertThat(dashboard.getTotalEmployees()).isEqualTo(1);
        assertThat(dashboard.getPresentCount()).isEqualTo(1);
        assertThat(dashboard.getAttendanceStats().getRemote()).isEqualTo(1);
        assertThat(dashboard.getHoursWorked()).isEqualByComparingTo("7.50");
        assertThat(dashboard.getRequestStats().getLeave()).isEqualTo(1);
        assertThat(dashboard.getRequestStats().getAutorisation()).isEqualTo(1);
        assertThat(dashboard.getRequestStats().getTeletravail()).isZero();
        assertThat(dashboard.getPendingRequests())
                .singleElement()
                .satisfies(request -> {
                    assertThat(request.getType()).isEqualTo("maladie");
                    assertThat(request.getEmployeeName()).isEqualTo("Essia Dupont");
                });
        assertThat(dashboard.getDepartmentEmployeeCounts()).containsEntry("RH", 1L);
        assertThat(dashboard.getRecentActivities()).hasSize(2);
        assertThat(dashboard.getMonthlyRequestEvolution())
                .containsEntry(5, 2L);
    }
}
