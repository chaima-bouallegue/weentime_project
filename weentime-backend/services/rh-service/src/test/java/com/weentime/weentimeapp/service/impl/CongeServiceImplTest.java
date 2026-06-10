package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.CongeDTO;
import com.weentime.weentimeapp.entity.Conge;
import com.weentime.weentimeapp.entity.SoldeConge;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.mapper.CongeMapper;
import com.weentime.weentimeapp.repository.CongeRepository;
import com.weentime.weentimeapp.repository.SoldeCongeRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.service.AsyncNotificationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CongeServiceImplTest {

    @Mock
    private CongeRepository congeRepository;

    @Mock
    private SoldeCongeRepository soldeCongeRepository;

    @Mock
    private TypeCongeRepository typeCongeRepository;

    @Mock
    private CongeMapper congeMapper;

    @Mock
    private OrganisationServiceClient organisationServiceClient;

    @Mock
    private AsyncNotificationService asyncNotificationService;

    private CongeServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new CongeServiceImpl(
                congeRepository,
                soldeCongeRepository,
                typeCongeRepository,
                congeMapper,
                organisationServiceClient,
                asyncNotificationService
        );
        setSecurity(List.of());
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void employeeCannotRequestLeaveWithExhaustedBalance() {
        CongeDTO dto = leaveDto();
        TypeConge type = TypeConge.builder()
                .id(1L)
                .entrepriseId(13L)
                .libelle("Conge annuel")
                .decompteJours(true)
                .requireJustificatif(false)
                .build();
        SoldeConge solde = SoldeConge.builder()
                .utilisateurId(24L)
                .typeCongeId(1L)
                .annee(2026)
                .joursRestants(2.0)
                .joursEnAttente(0.0)
                .build();

        when(congeRepository.existsOverlappingConge(24L, dto.getDateDebut(), dto.getDateFin())).thenReturn(false);
        when(typeCongeRepository.findById(1L)).thenReturn(Optional.of(type));
        when(soldeCongeRepository.findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(24L, 1L, 2026))
                .thenReturn(Optional.of(solde));

        assertThatThrownBy(() -> service.create(dto))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void justificatifRequiredBlocksRequestWithoutJustificatif() {
        CongeDTO dto = leaveDto();
        TypeConge type = TypeConge.builder()
                .id(1L)
                .entrepriseId(13L)
                .libelle("Conge maladie")
                .decompteJours(false)
                .requireJustificatif(true)
                .build();

        when(congeRepository.existsOverlappingConge(24L, dto.getDateDebut(), dto.getDateFin())).thenReturn(false);
        when(typeCongeRepository.findById(1L)).thenReturn(Optional.of(type));

        assertThatThrownBy(() -> service.create(dto))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void managerApproveMovesRequestToRhPending() {
        Conge conge = Conge.builder()
                .id(8L)
                .utilisateurId(24L)
                .entrepriseId(13L)
                .typeCongeId(1L)
                .dateDebut(LocalDate.of(2026, 6, 1))
                .dateFin(LocalDate.of(2026, 6, 1))
                .nombreJours(1)
                .statut(StatutDemandeEnum.EN_ATTENTE_MANAGER)
                .build();

        when(congeRepository.findById(8L)).thenReturn(Optional.of(conge));
        when(congeRepository.save(any(Conge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(congeMapper.toDto(any(Conge.class))).thenAnswer(invocation -> {
            Conge saved = invocation.getArgument(0);
            return CongeDTO.builder().id(saved.getId()).statut(saved.getStatut()).build();
        });

        CongeDTO result = service.validateByManager(8L, 99L);

        assertThat(result.getStatut()).isEqualTo(StatutDemandeEnum.EN_ATTENTE_RH);
        assertThat(conge.getManagerId()).isEqualTo(99L);
    }

    @Test
    void rhApproveConsumesBalanceAndClearsPendingDays() {
        setSecurity(List.of("ROLE_RH"));
        Conge conge = Conge.builder()
                .id(8L)
                .utilisateurId(24L)
                .entrepriseId(13L)
                .typeCongeId(1L)
                .dateDebut(LocalDate.of(2026, 6, 1))
                .dateFin(LocalDate.of(2026, 6, 2))
                .nombreJours(2)
                .statut(StatutDemandeEnum.EN_ATTENTE_RH)
                .build();
        TypeConge type = TypeConge.builder().id(1L).decompteJours(true).build();
        SoldeConge solde = SoldeConge.builder()
                .utilisateurId(24L)
                .typeCongeId(1L)
                .annee(2026)
                .joursRestants(10.0)
                .joursUtilises(1.0)
                .joursEnAttente(2.0)
                .build();

        when(congeRepository.findById(8L)).thenReturn(Optional.of(conge));
        when(typeCongeRepository.findById(1L)).thenReturn(Optional.of(type));
        when(soldeCongeRepository.findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(24L, 1L, 2026))
                .thenReturn(Optional.of(solde));
        when(congeRepository.save(any(Conge.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(congeMapper.toDto(any(Conge.class))).thenAnswer(invocation -> {
            Conge saved = invocation.getArgument(0);
            return CongeDTO.builder().id(saved.getId()).statut(saved.getStatut()).build();
        });

        CongeDTO result = service.validateByRH(8L, 77L);

        assertThat(result.getStatut()).isEqualTo(StatutDemandeEnum.APPROUVE);
        assertThat(solde.getJoursRestants()).isEqualTo(8.0);
        assertThat(solde.getJoursUtilises()).isEqualTo(3.0);
        assertThat(solde.getJoursEnAttente()).isEqualTo(0.0);
        ArgumentCaptor<SoldeConge> captor = ArgumentCaptor.forClass(SoldeConge.class);
        verify(soldeCongeRepository).save(captor.capture());
        assertThat(captor.getValue().getJoursRestants()).isEqualTo(8.0);
    }

    private CongeDTO leaveDto() {
        return CongeDTO.builder()
                .typeCongeId(1L)
                .dateDebut(LocalDate.of(2026, 6, 1))
                .dateFin(LocalDate.of(2026, 6, 3))
                .motif("Vacances familiales")
                .build();
    }

    private void setSecurity(List<String> roles) {
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                "employee@example.com",
                "n/a",
                roles.stream().map(org.springframework.security.core.authority.SimpleGrantedAuthority::new).toList()
        );
        authentication.setDetails(Map.of("userId", 24L, "entrepriseId", 13L));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
