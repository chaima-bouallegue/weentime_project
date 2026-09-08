package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.AutorisationDTO;
import com.weentime.weentimeapp.dto.TypeAutorisationDTO;
import com.weentime.weentimeapp.dto.UtilisateurAuthResponse;
import com.weentime.weentimeapp.entity.Autorisation;
import com.weentime.weentimeapp.entity.TypeAutorisation;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.mapper.AutorisationMapper;
import com.weentime.weentimeapp.repository.AutorisationRepository;
import com.weentime.weentimeapp.repository.TypeAutorisationRepository;
import com.weentime.weentimeapp.service.AsyncNotificationService;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AutorisationServiceImplTest {

    @Mock
    private AutorisationRepository repository;

    @Mock
    private TypeAutorisationRepository typeRepository;

    @Mock
    private AutorisationMapper mapper;

    @Mock
    private OrganisationServiceClient organisationClient;

    @Mock
    private AsyncNotificationService asyncNotificationService;

    private AutorisationServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new AutorisationServiceImpl(
                repository,
                typeRepository,
                mapper,
                organisationClient,
                asyncNotificationService
        );
    }

    @Test
    void createCalculatesDurationAndNotifiesManager() {
        String email = "emp@test.com";
        UtilisateurAuthResponse user = new UtilisateurAuthResponse();
        user.setId(10L);
        user.setNom("Ben Ali");
        user.setPrenom("Sami");
        user.setEntrepriseId(1L);
        user.setManagerId(2L);
        when(organisationClient.getUtilisateurForAuth(email)).thenReturn(user);

        TypeAutorisationDTO typeDto = TypeAutorisationDTO.builder().id(5L).libelle("Médicale").build();
        AutorisationDTO inputDto = new AutorisationDTO();
        inputDto.setTypeAutorisation(typeDto);
        inputDto.setDateAutorisation(LocalDate.of(2026, 8, 1));
        inputDto.setHeureDebut(LocalTime.of(14, 0));
        inputDto.setHeureFin(LocalTime.of(15, 30));

        Autorisation entity = new Autorisation();
        entity.setDateAutorisation(LocalDate.of(2026, 8, 1));
        entity.setHeureDebut(LocalTime.of(14, 0));
        entity.setHeureFin(LocalTime.of(15, 30));

        TypeAutorisation typeEntity = new TypeAutorisation();
        typeEntity.setId(5L);
        typeEntity.setLibelle("Médicale");

        when(mapper.toEntity(inputDto)).thenReturn(entity);
        when(typeRepository.findById(5L)).thenReturn(Optional.of(typeEntity));
        when(repository.save(entity)).thenAnswer(inv -> {
            Autorisation a = inv.getArgument(0);
            a.setId(100L);
            return a;
        });

        AutorisationDTO returnedDto = new AutorisationDTO();
        returnedDto.setId(100L);
        when(mapper.toDto(any())).thenReturn(returnedDto);

        AutorisationDTO result = service.create(inputDto, email);

        assertThat(result).isNotNull();
        assertThat(entity.getDuree()).isEqualTo(90); // 1h30 = 90 min
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.EN_ATTENTE_MANAGER);
        verify(asyncNotificationService).sendToUser(eq(2L), any(), eq(1L));
    }

    @Test
    void validateManagerDirectlyApprovesWhenDurationUnderOrEqual120Minutes() {
        String managerEmail = "mgr@test.com";
        UtilisateurAuthResponse manager = new UtilisateurAuthResponse();
        manager.setId(2L);
        when(organisationClient.getUtilisateurForAuth(managerEmail)).thenReturn(manager);

        Autorisation entity = new Autorisation();
        entity.setId(50L);
        entity.setUtilisateurId(10L);
        entity.setEntrepriseId(1L);
        entity.setDuree(120); // <= 120 -> directly APPROUVE

        when(repository.findById(50L)).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenAnswer(inv -> inv.getArgument(0));

        AutorisationDTO dto = new AutorisationDTO();
        dto.setId(50L);
        when(mapper.toDto(entity)).thenReturn(dto);

        AutorisationDTO result = service.validateManager(50L, managerEmail);

        assertThat(result).isNotNull();
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.APPROUVE);
        verify(asyncNotificationService).sendToUser(eq(10L), any(), eq(1L));
    }

    @Test
    void validateManagerRoutesToRhWhenDurationExceeds120Minutes() {
        String managerEmail = "mgr@test.com";
        UtilisateurAuthResponse manager = new UtilisateurAuthResponse();
        manager.setId(2L);
        when(organisationClient.getUtilisateurForAuth(managerEmail)).thenReturn(manager);

        Autorisation entity = new Autorisation();
        entity.setId(51L);
        entity.setUtilisateurId(10L);
        entity.setEntrepriseId(1L);
        entity.setDuree(180); // > 120 -> EN_ATTENTE_RH

        when(repository.findById(51L)).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenAnswer(inv -> inv.getArgument(0));

        AutorisationDTO dto = new AutorisationDTO();
        dto.setId(51L);
        when(mapper.toDto(entity)).thenReturn(dto);

        AutorisationDTO result = service.validateManager(51L, managerEmail);

        assertThat(result).isNotNull();
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.EN_ATTENTE_RH);
        verify(asyncNotificationService).sendToRole(eq("ROLE_RH"), any(), eq(1L));
    }

    @Test
    void validateRhApprovesPendingRhRequest() {
        String rhEmail = "rh@test.com";
        UtilisateurAuthResponse rh = new UtilisateurAuthResponse();
        rh.setId(3L);
        when(organisationClient.getUtilisateurForAuth(rhEmail)).thenReturn(rh);

        Autorisation entity = new Autorisation();
        entity.setId(60L);
        entity.setUtilisateurId(10L);
        entity.setEntrepriseId(1L);
        entity.setStatut(StatutDemandeEnum.EN_ATTENTE_RH);

        when(repository.findById(60L)).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenAnswer(inv -> inv.getArgument(0));

        AutorisationDTO dto = new AutorisationDTO();
        dto.setId(60L);
        when(mapper.toDto(entity)).thenReturn(dto);

        AutorisationDTO result = service.validateRH(60L, rhEmail);

        assertThat(result).isNotNull();
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.APPROUVE);
        verify(asyncNotificationService).sendToUser(eq(10L), any(), eq(1L));
    }

    @Test
    void validateRhThrowsWhenStatusNotPendingRh() {
        String rhEmail = "rh@test.com";
        UtilisateurAuthResponse rh = new UtilisateurAuthResponse();
        rh.setId(3L);
        when(organisationClient.getUtilisateurForAuth(rhEmail)).thenReturn(rh);

        Autorisation entity = new Autorisation();
        entity.setId(61L);
        entity.setStatut(StatutDemandeEnum.EN_ATTENTE_MANAGER);
        when(repository.findById(61L)).thenReturn(Optional.of(entity));

        assertThatThrownBy(() -> service.validateRH(61L, rhEmail))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Seules les demandes en attente RH");
    }

    @Test
    void rejectSetsRefuseAndNotifiesUser() {
        String validatorEmail = "mgr@test.com";
        UtilisateurAuthResponse validator = new UtilisateurAuthResponse();
        validator.setId(2L);
        when(organisationClient.getUtilisateurForAuth(validatorEmail)).thenReturn(validator);

        Autorisation entity = new Autorisation();
        entity.setId(70L);
        entity.setUtilisateurId(10L);
        entity.setEntrepriseId(1L);

        when(repository.findById(70L)).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenAnswer(inv -> inv.getArgument(0));

        AutorisationDTO dto = new AutorisationDTO();
        dto.setId(70L);
        when(mapper.toDto(entity)).thenReturn(dto);

        AutorisationDTO result = service.reject(70L, validatorEmail, "Charge trop élevée");

        assertThat(result).isNotNull();
        assertThat(entity.getStatut()).isEqualTo(StatutDemandeEnum.REFUSE);
        assertThat(entity.getCommentaireValidateur()).isEqualTo("Charge trop élevée");
        verify(asyncNotificationService).sendToUser(eq(10L), any(), eq(1L));
    }

    @Test
    void cancelThrowsWhenUserDoesNotOwnAutorisation() {
        String userEmail = "wrong@test.com";
        UtilisateurAuthResponse user = new UtilisateurAuthResponse();
        user.setId(99L);
        when(organisationClient.getUtilisateurForAuth(userEmail)).thenReturn(user);

        Autorisation entity = new Autorisation();
        entity.setId(80L);
        entity.setUtilisateurId(10L);
        when(repository.findById(80L)).thenReturn(Optional.of(entity));

        assertThatThrownBy(() -> service.cancel(80L, userEmail))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
