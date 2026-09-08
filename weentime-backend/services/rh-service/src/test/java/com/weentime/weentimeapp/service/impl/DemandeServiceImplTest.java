package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.DemandeDTO;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.entity.Autorisation;
import com.weentime.weentimeapp.entity.Conge;
import com.weentime.weentimeapp.entity.Demande;
import com.weentime.weentimeapp.entity.Teletravail;
import com.weentime.weentimeapp.entity.TypeAutorisation;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.mapper.DemandeMapper;
import com.weentime.weentimeapp.repository.DemandeRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.service.UserCacheService;
import jakarta.persistence.EntityNotFoundException;
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
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DemandeServiceImplTest {

    @Mock
    private DemandeRepository demandeRepository;

    @Mock
    private DemandeMapper demandeMapper;

    @Mock
    private OrganisationServiceClient organisationServiceClient;

    @Mock
    private TypeCongeRepository typeCongeRepository;

    @Mock
    private UserCacheService userCacheService;

    private DemandeServiceImpl service;

    private static final Long ENTREPRISE_ID = 50L;

    @BeforeEach
    void setUp() {
        service = new DemandeServiceImpl(
                demandeRepository,
                demandeMapper,
                organisationServiceClient,
                typeCongeRepository,
                userCacheService
        );

        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                "manager@example.com", "n/a", List.of()
        );
        auth.setDetails(Map.of("entrepriseId", ENTREPRISE_ID));
        SecurityContextHolder.getContext().setAuthentication(auth);

        // Default lenient mock for userCacheService
        org.mockito.Mockito.lenient().when(userCacheService.getOrLoad(any(), any())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            @SuppressWarnings("unchecked")
            Function<Long, UserResponse> loader = inv.getArgument(1);
            return loader.apply(id);
        });
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getByIdReturnsDtoWhenFound() {
        Conge demande = new Conge();
        demande.setId(100L);

        DemandeDTO dto = new DemandeDTO();
        dto.setId(100L);

        when(demandeRepository.findById(100L)).thenReturn(Optional.of(demande));
        when(demandeMapper.toDto(demande)).thenReturn(dto);

        DemandeDTO result = service.getById(100L);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(100L);
    }

    @Test
    void getByIdThrowsExceptionWhenNotFound() {
        when(demandeRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getById(999L))
                .isInstanceOf(EntityNotFoundException.class)
                .hasMessageContaining("Demande not found");
    }

    @Test
    void getAllByUtilisateurEnrichesWithCongeAndUserData() {
        Long userId = 7L;
        Conge conge = new Conge();
        conge.setId(1L);
        conge.setUtilisateurId(userId);
        conge.setDateDebut(LocalDate.of(2026, 6, 1));
        conge.setDateFin(LocalDate.of(2026, 6, 5));
        conge.setNombreJours(5);
        conge.setTypeCongeId(20L);

        DemandeDTO dto = new DemandeDTO();
        dto.setId(1L);
        dto.setUtilisateurId(userId);

        when(demandeRepository.findByUtilisateurIdInOrderByDateCreationDesc(List.of(userId)))
                .thenReturn(List.of(conge));
        when(demandeMapper.toDtoList(List.of(conge)))
                .thenReturn(List.of(dto));

        TypeConge typeConge = new TypeConge();
        typeConge.setId(20L);
        typeConge.setLibelle("Congé payé");
        when(typeCongeRepository.findAllById(Set.of(20L))).thenReturn(List.of(typeConge));

        UserResponse user = new UserResponse();
        user.setId(userId);
        user.setNom("Dupont");
        user.setPrenom("Jean");
        when(organisationServiceClient.getUtilisateurById(userId)).thenReturn(user);

        List<DemandeDTO> results = service.getAllByUtilisateur(userId);

        assertThat(results).hasSize(1);
        DemandeDTO resDto = results.get(0);
        assertThat(resDto.getTypeCongeNom()).isEqualTo("Congé payé");
        assertThat(resDto.getNombreJours()).isEqualTo(5.0);
        assertThat(resDto.getUtilisateur()).isNotNull();
        assertThat(resDto.getUtilisateur().get("nom")).isEqualTo("Dupont");
    }

    @Test
    void getByManagerFindsTeamDemandesAndEnrichesTeletravailAndAutorisation() {
        Long managerId = 10L;
        Long emp1 = 11L;
        Long emp2 = 12L;

        UserResponse member1 = new UserResponse();
        member1.setId(emp1);
        member1.setManagerId(managerId);

        UserResponse member2 = new UserResponse();
        member2.setId(emp2);
        member2.setManagerId(managerId);

        when(organisationServiceClient.findUsersByEntreprise(ENTREPRISE_ID))
                .thenReturn(List.of(member1, member2));

        Teletravail teletravail = new Teletravail();
        teletravail.setId(2L);
        teletravail.setUtilisateurId(emp1);
        teletravail.setDateDebut(LocalDate.of(2026, 7, 1));
        teletravail.setDateFin(LocalDate.of(2026, 7, 1));
        teletravail.setNombreJours(1.0);

        Autorisation autorisation = new Autorisation();
        autorisation.setId(3L);
        autorisation.setUtilisateurId(emp2);
        autorisation.setDateAutorisation(LocalDate.of(2026, 7, 2));
        autorisation.setHeureDebut(LocalTime.of(9, 0));
        autorisation.setHeureFin(LocalTime.of(11, 0));
        autorisation.setDuree(120);
        TypeAutorisation typeAut = new TypeAutorisation();
        typeAut.setLibelle("Sortie");
        autorisation.setTypeAutorisation(typeAut);

        DemandeDTO dto2 = new DemandeDTO();
        dto2.setId(2L);
        dto2.setUtilisateurId(emp1);

        DemandeDTO dto3 = new DemandeDTO();
        dto3.setId(3L);
        dto3.setUtilisateurId(emp2);

        when(demandeRepository.findByUtilisateurIdInOrderByDateCreationDesc(List.of(emp1, emp2)))
                .thenReturn(List.of(teletravail, autorisation));
        when(demandeMapper.toDtoList(List.of(teletravail, autorisation)))
                .thenReturn(List.of(dto2, dto3));

        List<DemandeDTO> results = service.getByManager(managerId);

        assertThat(results).hasSize(2);
        assertThat(dto2.getNombreJours()).isEqualTo(1.0);
        assertThat(dto3.getNombreJours()).isEqualTo(2.0); // 120 / 60
        assertThat(dto3.getTypeAutorisation()).isEqualTo("Sortie");
    }

    @Test
    void getAllForEntrepriseReturnsEmptyWhenNullId() {
        List<DemandeDTO> results = service.getAllForEntreprise(null);

        assertThat(results).isEmpty();
    }
}
