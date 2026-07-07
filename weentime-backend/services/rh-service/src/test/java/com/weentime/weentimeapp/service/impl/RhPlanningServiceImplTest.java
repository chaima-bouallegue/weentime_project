package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.client.PresenceServiceClient;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.dto.response.PlanningResponseDTO;
import com.weentime.weentimeapp.entity.Autorisation;
import com.weentime.weentimeapp.entity.Conge;
import com.weentime.weentimeapp.entity.Teletravail;
import com.weentime.weentimeapp.repository.AutorisationRepository;
import com.weentime.weentimeapp.repository.CongeRepository;
import com.weentime.weentimeapp.repository.TeletravailRepository;
import com.weentime.weentimeapp.service.AsyncNotificationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDate;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RhPlanningServiceImplTest {

    @Mock
    private OrganisationServiceClient organisationServiceClient;

    @Mock
    private PresenceServiceClient presenceServiceClient;

    @Mock
    private CongeRepository congeRepository;

    @Mock
    private TeletravailRepository teletravailRepository;

    @Mock
    private AutorisationRepository autorisationRepository;

    @Mock
    private AsyncNotificationService asyncNotificationService;

    private RhPlanningServiceImpl service;

    private static final long ENTREPRISE_ID = 13L;

    @BeforeEach
    void setUp() {
        service = new RhPlanningServiceImpl(
                organisationServiceClient,
                congeRepository,
                teletravailRepository,
                autorisationRepository,
                presenceServiceClient,
                asyncNotificationService
        );

        Map<String, Object> details = new HashMap<>();
        details.put("entrepriseId", ENTREPRISE_ID);
        details.put("userId", 22L);

        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken("admin@test.com", null, List.of());
        auth.setDetails(details);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private UserResponse user(Long id, String nom, String prenom) {
        return UserResponse.builder()
                .id(id).nom(nom).prenom(prenom)
                .email(prenom.toLowerCase() + "." + nom.toLowerCase() + "@test.com")
                .poste("Dev").departementNom("Engineering").equipeNom("Equipe A")
                .build();
    }

    private PresenceServiceClient.PresenceResponse presenceFor(LocalDate date, Long userId, String arrivalTime) {
        var ms = PresenceServiceClient.MemberStatus.builder().utilisateurId(userId).heureEntree(arrivalTime).build();
        return new PresenceServiceClient.PresenceResponse(List.of(ms), null);
    }

    @Test
    void pastDateWithoutPointageShouldReturnAbsence() {
        LocalDate today = LocalDate.now();
        LocalDate pastDate = today.minusDays(2);
        UserResponse user = user(1L, "Durand", "Alice");

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(user));
        when(presenceServiceClient.getStatusRange(eq(ENTREPRISE_ID), any(), eq(pastDate), eq(pastDate)))
                .thenReturn(Collections.emptyMap());
        when(congeRepository.findApprovedForDateRange(ENTREPRISE_ID, pastDate, pastDate))
                .thenReturn(List.of());
        when(teletravailRepository.findApprovedForDateRange(ENTREPRISE_ID, pastDate, pastDate))
                .thenReturn(List.of());
        when(autorisationRepository.findApprovedForDateRange(ENTREPRISE_ID, pastDate, pastDate))
                .thenReturn(List.of());

        List<PlanningResponseDTO> result = service.getPlanning(pastDate, pastDate, null, null);

        assertThat(result).hasSize(1);
        PlanningResponseDTO day = result.get(0);
        assertThat(day.getDateType()).isEqualTo("PAST");
        assertThat(day.getEmployees()).hasSize(1);
        assertThat(day.getEmployees().get(0).getStatus()).isEqualTo("ABSENCE");
        assertThat(day.getEmployees().get(0).getDetail()).isEqualTo("Non pointé");
        assertThat(day.getPresenceRate()).isEqualTo(0.0);
        assertThat(day.getPresenceText()).isEqualTo("0/1");
    }

    @Test
    void pastDateWithPointageShouldReturnPresent() {
        LocalDate today = LocalDate.now();
        LocalDate pastDate = today.minusDays(2);
        UserResponse user = user(1L, "Durand", "Alice");

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(user));
        when(presenceServiceClient.getStatusRange(eq(ENTREPRISE_ID), any(), eq(pastDate), eq(pastDate)))
                .thenReturn(Map.of(pastDate, presenceFor(pastDate, 1L, "09:05")));
        when(congeRepository.findApprovedForDateRange(ENTREPRISE_ID, pastDate, pastDate))
                .thenReturn(List.of());
        when(teletravailRepository.findApprovedForDateRange(ENTREPRISE_ID, pastDate, pastDate))
                .thenReturn(List.of());
        when(autorisationRepository.findApprovedForDateRange(ENTREPRISE_ID, pastDate, pastDate))
                .thenReturn(List.of());

        List<PlanningResponseDTO> result = service.getPlanning(pastDate, pastDate, null, null);

        assertThat(result).hasSize(1);
        PlanningResponseDTO day = result.get(0);
        assertThat(day.getDateType()).isEqualTo("PAST");
        assertThat(day.getEmployees().get(0).getStatus()).isEqualTo("PRESENT");
        assertThat(day.getEmployees().get(0).getDetail()).contains("Au bureau");
        assertThat(day.getPresenceRate()).isEqualTo(1.0);
        assertThat(day.getPresenceText()).isEqualTo("1/1");
    }

    @Test
    void todayWithoutPointageShouldReturnPending() {
        LocalDate today = LocalDate.now();
        UserResponse user = user(1L, "Durand", "Alice");

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(user));
        when(presenceServiceClient.getStatusRange(eq(ENTREPRISE_ID), any(), eq(today), eq(today)))
                .thenReturn(Collections.emptyMap());
        when(congeRepository.findApprovedForDateRange(ENTREPRISE_ID, today, today))
                .thenReturn(List.of());
        when(teletravailRepository.findApprovedForDateRange(ENTREPRISE_ID, today, today))
                .thenReturn(List.of());
        when(autorisationRepository.findApprovedForDateRange(ENTREPRISE_ID, today, today))
                .thenReturn(List.of());

        List<PlanningResponseDTO> result = service.getPlanning(today, today, null, null);

        assertThat(result).hasSize(1);
        PlanningResponseDTO day = result.get(0);
        assertThat(day.getDateType()).isEqualTo("TODAY");
        assertThat(day.getEmployees().get(0).getStatus()).isEqualTo("PENDING");
        assertThat(day.getEmployees().get(0).getDetail()).isEqualTo("En attente de pointage");
        assertThat(day.getPresenceRate()).isEqualTo(0.0);
        assertThat(day.getPresenceText()).isEqualTo("0/1");
    }

    @Test
    void todayWithPartialPointageShouldReturnCorrectRate() {
        LocalDate today = LocalDate.now();
        UserResponse alice = user(1L, "Durand", "Alice");
        UserResponse bob = user(2L, "Martin", "Bob");

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(alice, bob));
        when(presenceServiceClient.getStatusRange(eq(ENTREPRISE_ID), any(), eq(today), eq(today)))
                .thenReturn(Map.of(today, presenceFor(today, 1L, "08:45")));
        when(congeRepository.findApprovedForDateRange(ENTREPRISE_ID, today, today))
                .thenReturn(List.of());
        when(teletravailRepository.findApprovedForDateRange(ENTREPRISE_ID, today, today))
                .thenReturn(List.of());
        when(autorisationRepository.findApprovedForDateRange(ENTREPRISE_ID, today, today))
                .thenReturn(List.of());

        List<PlanningResponseDTO> result = service.getPlanning(today, today, null, null);

        assertThat(result).hasSize(1);
        PlanningResponseDTO day = result.get(0);
        assertThat(day.getDateType()).isEqualTo("TODAY");
        // Alice is PRESENT (checked in), Bob is PENDING (no pointage yet)
        assertThat(day.getEmployees()).hasSize(2);
        assertThat(day.getEmployees().get(0).getStatus()).isEqualTo("PRESENT");
        assertThat(day.getEmployees().get(1).getStatus()).isEqualTo("PENDING");
        // Only PRESENT + REMOTE count in rate, PENDING excluded → 1/2 = 50%
        assertThat(day.getPresenceRate()).isEqualTo(0.5);
        assertThat(day.getPresenceText()).isEqualTo("1/2");
    }

    @Test
    void futureWorkdayShouldReturnScheduled() {
        LocalDate today = LocalDate.now();
        LocalDate futureDate = today.plusDays(3);
        UserResponse user = user(1L, "Durand", "Alice");

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(user));
        when(presenceServiceClient.getStatusRange(eq(ENTREPRISE_ID), any(), eq(futureDate), eq(futureDate)))
                .thenReturn(Collections.emptyMap());
        when(congeRepository.findApprovedForDateRange(ENTREPRISE_ID, futureDate, futureDate))
                .thenReturn(List.of());
        when(teletravailRepository.findApprovedForDateRange(ENTREPRISE_ID, futureDate, futureDate))
                .thenReturn(List.of());
        when(autorisationRepository.findApprovedForDateRange(ENTREPRISE_ID, futureDate, futureDate))
                .thenReturn(List.of());

        List<PlanningResponseDTO> result = service.getPlanning(futureDate, futureDate, null, null);

        assertThat(result).hasSize(1);
        PlanningResponseDTO day = result.get(0);
        assertThat(day.getDateType()).isEqualTo("FUTURE");
        assertThat(day.getEmployees().get(0).getStatus()).isEqualTo("SCHEDULED");
        assertThat(day.getEmployees().get(0).getDetail()).isEqualTo("Planifié");
        // SCHEDULED counts as planned present
        assertThat(day.getPresenceRate()).isEqualTo(1.0);
        assertThat(day.getPresenceText()).isEqualTo("1/1");
    }

    @Test
    void futureWeekendShouldReturnLeave() {
        // Find a future Saturday
        LocalDate futureSaturday = LocalDate.now().plusDays(1);
        while (futureSaturday.getDayOfWeek() != java.time.DayOfWeek.SATURDAY) {
            futureSaturday = futureSaturday.plusDays(1);
        }
        UserResponse user = user(1L, "Durand", "Alice");

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(user));
        when(presenceServiceClient.getStatusRange(eq(ENTREPRISE_ID), any(), eq(futureSaturday), eq(futureSaturday)))
                .thenReturn(Collections.emptyMap());
        when(congeRepository.findApprovedForDateRange(ENTREPRISE_ID, futureSaturday, futureSaturday))
                .thenReturn(List.of());
        when(teletravailRepository.findApprovedForDateRange(ENTREPRISE_ID, futureSaturday, futureSaturday))
                .thenReturn(List.of());
        when(autorisationRepository.findApprovedForDateRange(ENTREPRISE_ID, futureSaturday, futureSaturday))
                .thenReturn(List.of());

        List<PlanningResponseDTO> result = service.getPlanning(futureSaturday, futureSaturday, null, null);

        assertThat(result).hasSize(1);
        PlanningResponseDTO day = result.get(0);
        assertThat(day.getDateType()).isEqualTo("FUTURE");
        assertThat(day.isRestDay()).isTrue();
        assertThat(day.getEmployees().get(0).getStatus()).isEqualTo("LEAVE");
        assertThat(day.getEmployees().get(0).getDetail()).isEqualTo("Weekend / Repos");
        // Weekend: scheduled present = 0, confirmed present = 0 → 0/1
        assertThat(day.getPresenceRate()).isEqualTo(0.0);
        assertThat(day.getPresenceText()).isEqualTo("0/1");
    }

    @Test
    void futureDateWithApprovedLeaveShouldReturnLeave() {
        LocalDate today = LocalDate.now();
        LocalDate futureDate = today.plusDays(5);
        UserResponse user = user(1L, "Durand", "Alice");
        Conge conge = new Conge();
        conge.setUtilisateurId(1L);
        conge.setDateDebut(futureDate);
        conge.setDateFin(futureDate);

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(user));
        when(presenceServiceClient.getStatusRange(eq(ENTREPRISE_ID), any(), eq(futureDate), eq(futureDate)))
                .thenReturn(Collections.emptyMap());
        when(congeRepository.findApprovedForDateRange(ENTREPRISE_ID, futureDate, futureDate))
                .thenReturn(List.of(conge));
        when(teletravailRepository.findApprovedForDateRange(ENTREPRISE_ID, futureDate, futureDate))
                .thenReturn(List.of());
        when(autorisationRepository.findApprovedForDateRange(ENTREPRISE_ID, futureDate, futureDate))
                .thenReturn(List.of());

        List<PlanningResponseDTO> result = service.getPlanning(futureDate, futureDate, null, null);

        assertThat(result).hasSize(1);
        PlanningResponseDTO day = result.get(0);
        assertThat(day.getDateType()).isEqualTo("FUTURE");
        assertThat(day.getEmployees().get(0).getStatus()).isEqualTo("LEAVE");
        assertThat(day.getEmployees().get(0).getDetail()).isEqualTo("En Congé");
        // On leave → not counted in confirmed present
        assertThat(day.getPresenceRate()).isEqualTo(0.0);
        assertThat(day.getPresenceText()).isEqualTo("0/1");
    }

    @Test
    void futureDateWithMixedStatusesShouldComputeRateCorrectly() {
        LocalDate today = LocalDate.now();
        LocalDate futureDate = today.plusDays(5);
        UserResponse alice = user(1L, "Durand", "Alice");
        UserResponse bob = user(2L, "Martin", "Bob");
        UserResponse charlie = user(3L, "Petit", "Charlie");
        Conge conge = new Conge();
        conge.setUtilisateurId(1L);
        conge.setDateDebut(futureDate);
        conge.setDateFin(futureDate);
        Teletravail tt = new Teletravail();
        tt.setUtilisateurId(2L);
        tt.setDateDebut(futureDate);
        tt.setDateFin(futureDate);

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(alice, bob, charlie));
        when(presenceServiceClient.getStatusRange(eq(ENTREPRISE_ID), any(), eq(futureDate), eq(futureDate)))
                .thenReturn(Collections.emptyMap());
        when(congeRepository.findApprovedForDateRange(ENTREPRISE_ID, futureDate, futureDate))
                .thenReturn(List.of(conge));
        when(teletravailRepository.findApprovedForDateRange(ENTREPRISE_ID, futureDate, futureDate))
                .thenReturn(List.of(tt));
        when(autorisationRepository.findApprovedForDateRange(ENTREPRISE_ID, futureDate, futureDate))
                .thenReturn(List.of());

        List<PlanningResponseDTO> result = service.getPlanning(futureDate, futureDate, null, null);

        assertThat(result).hasSize(1);
        PlanningResponseDTO day = result.get(0);
        // Alice: LEAVE (congé), Bob: REMOTE (télétravail), Charlie: SCHEDULED
        // confirmedPresent = Bob(REMOTE) + Charlie(SCHEDULED) = 2
        // rate = 2/3 ≈ 66.7%
        assertThat(day.getPresenceRate()).isCloseTo(2.0 / 3.0, org.assertj.core.data.Offset.offset(0.001));
        assertThat(day.getPresenceText()).isEqualTo("2/3");
    }

    @Test
    void pastDateWithApprovedRemoteShouldReturnRemote() {
        LocalDate today = LocalDate.now();
        LocalDate pastDate = today.minusDays(3);
        UserResponse user = user(1L, "Durand", "Alice");
        Teletravail tt = new Teletravail();
        tt.setUtilisateurId(1L);
        tt.setDateDebut(pastDate);
        tt.setDateFin(pastDate);

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(user));
        when(presenceServiceClient.getStatusRange(eq(ENTREPRISE_ID), any(), eq(pastDate), eq(pastDate)))
                .thenReturn(Collections.emptyMap());
        when(congeRepository.findApprovedForDateRange(ENTREPRISE_ID, pastDate, pastDate))
                .thenReturn(List.of());
        when(teletravailRepository.findApprovedForDateRange(ENTREPRISE_ID, pastDate, pastDate))
                .thenReturn(List.of(tt));
        when(autorisationRepository.findApprovedForDateRange(ENTREPRISE_ID, pastDate, pastDate))
                .thenReturn(List.of());

        List<PlanningResponseDTO> result = service.getPlanning(pastDate, pastDate, null, null);

        assertThat(result).hasSize(1);
        PlanningResponseDTO day = result.get(0);
        assertThat(day.getDateType()).isEqualTo("PAST");
        assertThat(day.getEmployees().get(0).getStatus()).isEqualTo("REMOTE");
        assertThat(day.getPresenceRate()).isEqualTo(1.0);
    }
}
