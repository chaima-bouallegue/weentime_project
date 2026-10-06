package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.entity.ConfigTeletravail;
import com.weentime.weentimeapp.entity.Teletravail;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.TypeTeletravailEnum;
import com.weentime.weentimeapp.mapper.TeletravailMapper;
import com.weentime.weentimeapp.repository.ConfigTeletravailRepository;
import com.weentime.weentimeapp.repository.TeletravailRepository;
import com.weentime.weentimeapp.service.AsyncNotificationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TeletravailServiceImplTest {

    @Mock
    private TeletravailRepository repository;

    @Mock
    private ConfigTeletravailRepository configRepository;

    @Mock
    private TeletravailMapper mapper;

    @Mock
    private OrganisationServiceClient organisationClient;

    @Mock
    private AsyncNotificationService asyncNotificationService;

    private TeletravailServiceImpl service;

    private static final String USER_EMAIL = "emp@weentime.com";
    private static final Long USER_ID = 20L;
    private static final Long MANAGER_ID = 5L;
    private static final Long ENTREPRISE_ID = 1L;

    @BeforeEach
    void setUp() {
        service = new TeletravailServiceImpl(
                repository,
                configRepository,
                mapper,
                organisationClient,
                asyncNotificationService
        );

        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                USER_EMAIL, "n/a", List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void mockUser(Long userId, String email, Long managerId, Long entrepriseId) {
        UtilisateurAuthResponse authRes = new UtilisateurAuthResponse();
        authRes.setId(userId);
        when(organisationClient.getUtilisateurForAuth(email)).thenReturn(authRes);

        UserResponse userRes = new UserResponse();
        userRes.setId(userId);
        userRes.setNom("Ben Salah");
        userRes.setPrenom("Ali");
        userRes.setManagerId(managerId);
        userRes.setEntrepriseId(entrepriseId);
        when(organisationClient.getUtilisateurById(userId)).thenReturn(userRes);
    }

    @Test
    void createTeletravailSetsDaysAndNotifiesManager() {
        mockUser(USER_ID, USER_EMAIL, MANAGER_ID, ENTREPRISE_ID);

        TeletravailCreateDTO createDto = new TeletravailCreateDTO();
        createDto.setDateDebut(LocalDate.of(2026, 9, 10));
        createDto.setDateFin(LocalDate.of(2026, 9, 10));
        createDto.setType(TypeTeletravailEnum.JOURNEE_COMPLETE);

        Teletravail entity = new Teletravail();
        entity.setDateDebut(createDto.getDateDebut());
        entity.setDateFin(createDto.getDateFin());

        when(repository.existsConflictingTeletravail(eq(USER_ID), any(), any(), any())).thenReturn(false);
        when(mapper.toEntity(createDto)).thenReturn(entity);
        when(repository.save(any(Teletravail.class))).thenAnswer(inv -> {
            Teletravail t = inv.getArgument(0);
            t.setId(100L);
            return t;
        });

        TeletravailResponseDTO dto = new TeletravailResponseDTO();
        dto.setId(100L);
        when(mapper.toDto(any(Teletravail.class))).thenReturn(dto);

        TeletravailResponseDTO result = service.create(createDto, USER_EMAIL);

        assertThat(result).isNotNull();
        assertThat(entity.getNombreJours()).isEqualTo(1.0);
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.EN_ATTENTE_MANAGER);
        verify(asyncNotificationService).sendToUser(eq(MANAGER_ID), any(), eq(ENTREPRISE_ID));
    }

    @Test
    void createTeletravailThrowsConflictWhenDatesOverlap() {
        mockUser(USER_ID, USER_EMAIL, MANAGER_ID, ENTREPRISE_ID);

        TeletravailCreateDTO createDto = new TeletravailCreateDTO();
        createDto.setDateDebut(LocalDate.of(2026, 9, 10));
        createDto.setDateFin(LocalDate.of(2026, 9, 10));

        when(repository.existsConflictingTeletravail(eq(USER_ID), any(), any(), any())).thenReturn(true);

        assertThatThrownBy(() -> service.create(createDto, USER_EMAIL))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void annulerCancelsPendingManagerRequest() {
        UtilisateurAuthResponse authRes = new UtilisateurAuthResponse();
        authRes.setId(USER_ID);
        when(organisationClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(authRes);

        Teletravail entity = new Teletravail();
        entity.setId(50L);
        entity.setUtilisateurId(USER_ID);
        entity.setStatut(StatutDemandeEnum.EN_ATTENTE_MANAGER);

        when(repository.findById(50L)).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenAnswer(inv -> inv.getArgument(0));

        TeletravailResponseDTO dto = new TeletravailResponseDTO();
        dto.setId(50L);
        dto.setStatut(StatutDemandeEnum.ANNULE);
        when(mapper.toDto(entity)).thenReturn(dto);

        TeletravailResponseDTO result = service.annuler(50L, USER_EMAIL);

        assertThat(result.getStatut()).isEqualTo(StatutDemandeEnum.ANNULE);
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.ANNULE);
    }

    @Test
    void annulerCancelsPendingRhRequest() {
        UtilisateurAuthResponse authRes = new UtilisateurAuthResponse();
        authRes.setId(USER_ID);
        when(organisationClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(authRes);

        Teletravail entity = new Teletravail();
        entity.setId(51L);
        entity.setUtilisateurId(USER_ID);
        entity.setStatut(StatutDemandeEnum.EN_ATTENTE_RH);

        when(repository.findById(51L)).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenAnswer(inv -> inv.getArgument(0));

        TeletravailResponseDTO dto = new TeletravailResponseDTO();
        dto.setId(51L);
        dto.setStatut(StatutDemandeEnum.ANNULE);
        when(mapper.toDto(entity)).thenReturn(dto);

        TeletravailResponseDTO result = service.annuler(51L, USER_EMAIL);

        assertThat(result.getStatut()).isEqualTo(StatutDemandeEnum.ANNULE);
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.ANNULE);
    }

    @Test
    void updateTeletravailSuccess() {
        mockUser(USER_ID, USER_EMAIL, MANAGER_ID, ENTREPRISE_ID);

        Teletravail entity = new Teletravail();
        entity.setId(100L);
        entity.setUtilisateurId(USER_ID);
        entity.setManagerId(MANAGER_ID);
        entity.setEntrepriseId(ENTREPRISE_ID);
        entity.setDateDebut(LocalDate.of(2026, 9, 10));
        entity.setDateFin(LocalDate.of(2026, 9, 10));
        entity.setNombreJours(1.0);
        entity.setStatut(StatutDemandeEnum.EN_ATTENTE_RH);

        when(repository.findById(100L)).thenReturn(Optional.of(entity));
        when(repository.existsConflictingTeletravailExcludingId(eq(USER_ID), eq(100L), any(), any(), any())).thenReturn(false);

        ConfigTeletravail config = ConfigTeletravail.builder().entrepriseId(ENTREPRISE_ID).quotaMensuel(10).build();
        when(configRepository.findByEntrepriseId(ENTREPRISE_ID)).thenReturn(Optional.of(config));

        when(repository.sumNombreJoursByUtilisateurIdAndMonth(eq(USER_ID), any(Integer.class), any(Integer.class), eq(List.of(StatutDemandeEnum.APPROUVE))))
                .thenReturn(2.0);
        when(repository.sumNombreJoursByUtilisateurIdAndMonth(eq(USER_ID), any(Integer.class), any(Integer.class), eq(List.of(StatutDemandeEnum.EN_ATTENTE_MANAGER, StatutDemandeEnum.EN_ATTENTE_RH))))
                .thenReturn(1.0);

        when(repository.save(any(Teletravail.class))).thenAnswer(inv -> inv.getArgument(0));

        TeletravailCreateDTO updateDto = new TeletravailCreateDTO();
        updateDto.setDateDebut(LocalDate.of(2026, 9, 15));
        updateDto.setDateFin(LocalDate.of(2026, 9, 16));
        updateDto.setType(TypeTeletravailEnum.JOURNEE_COMPLETE);
        updateDto.setMotif("Modification motif valide");

        TeletravailResponseDTO dto = new TeletravailResponseDTO();
        dto.setId(100L);
        when(mapper.toDto(any(Teletravail.class))).thenReturn(dto);

        TeletravailResponseDTO result = service.update(100L, updateDto, USER_EMAIL);

        assertThat(result).isNotNull();
        assertThat(entity.getNombreJours()).isEqualTo(2.0);
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.EN_ATTENTE_MANAGER);
        verify(asyncNotificationService).sendToUser(eq(MANAGER_ID), any(), eq(ENTREPRISE_ID));
    }

    @Test
    void updateTeletravailThrowsConflictWhenAlreadyApproved() {
        UtilisateurAuthResponse authRes = new UtilisateurAuthResponse();
        authRes.setId(USER_ID);
        when(organisationClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(authRes);

        Teletravail entity = new Teletravail();
        entity.setId(101L);
        entity.setUtilisateurId(USER_ID);
        entity.setStatut(StatutDemandeEnum.APPROUVE);

        when(repository.findById(101L)).thenReturn(Optional.of(entity));

        TeletravailCreateDTO updateDto = new TeletravailCreateDTO();
        updateDto.setDateDebut(LocalDate.of(2026, 9, 20));
        updateDto.setDateFin(LocalDate.of(2026, 9, 20));
        updateDto.setType(TypeTeletravailEnum.JOURNEE_COMPLETE);

        assertThatThrownBy(() -> service.update(101L, updateDto, USER_EMAIL))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void validerManagerTransitionsStatusToEnAttenteRh() {
        Teletravail entity = new Teletravail();
        entity.setId(60L);
        entity.setUtilisateurId(USER_ID);
        entity.setEntrepriseId(ENTREPRISE_ID);
        entity.setStatut(StatutDemandeEnum.EN_ATTENTE_MANAGER);

        when(repository.findById(60L)).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenAnswer(inv -> inv.getArgument(0));

        TeletravailResponseDTO dto = new TeletravailResponseDTO();
        dto.setId(60L);
        when(mapper.toDto(entity)).thenReturn(dto);

        TeletravailResponseDTO result = service.validerManager(60L, MANAGER_ID, "OK pour moi");

        assertThat(result).isNotNull();
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.EN_ATTENTE_RH);
        assertThat(entity.getCommentaireManager()).isEqualTo("OK pour moi");
        verify(asyncNotificationService).sendToRole(eq("ROLE_RH"), any(), eq(ENTREPRISE_ID));
    }

    @Test
    void getQuotaReturnsCorrectBalances() {
        UtilisateurAuthResponse authRes = new UtilisateurAuthResponse();
        authRes.setId(USER_ID);
        when(organisationClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(authRes);

        UserResponse user = new UserResponse();
        user.setId(USER_ID);
        user.setEntrepriseId(ENTREPRISE_ID);
        when(organisationClient.getUtilisateurById(USER_ID)).thenReturn(user);

        ConfigTeletravail config = ConfigTeletravail.builder()
                .entrepriseId(ENTREPRISE_ID)
                .quotaMensuel(6)
                .build();
        when(configRepository.findByEntrepriseId(ENTREPRISE_ID)).thenReturn(Optional.of(config));

        when(repository.sumNombreJoursByUtilisateurIdAndMonth(eq(USER_ID), any(Integer.class), any(Integer.class), eq(List.of(StatutDemandeEnum.APPROUVE))))
                .thenReturn(2.0);
        when(repository.sumNombreJoursByUtilisateurIdAndMonth(eq(USER_ID), any(Integer.class), any(Integer.class), eq(List.of(StatutDemandeEnum.EN_ATTENTE_MANAGER, StatutDemandeEnum.EN_ATTENTE_RH))))
                .thenReturn(1.0);

        QuotaTeletravailDTO quota = service.getQuota(USER_EMAIL);

        assertThat(quota).isNotNull();
        assertThat(quota.getJoursAutorises()).isEqualTo(6);
        assertThat(quota.getJoursUtilises()).isEqualTo(2.0);
        assertThat(quota.getJoursEnAttente()).isEqualTo(1.0);
        assertThat(quota.getJoursRestants()).isEqualTo(3.0); // 6 - 2 - 1 = 3
    }
}
