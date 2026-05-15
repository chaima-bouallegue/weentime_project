package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.SoldeCongeDTO;
import com.weentime.weentimeapp.entity.SoldeConge;
import com.weentime.weentimeapp.mapper.SoldeCongeMapper;
import com.weentime.weentimeapp.repository.SoldeCongeRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SoldeCongeServiceImplTest {

    @Mock
    private SoldeCongeRepository soldeCongeRepository;

    @Mock
    private TypeCongeRepository typeCongeRepository;

    @Mock
    private SoldeCongeMapper soldeCongeMapper;

    @InjectMocks
    private SoldeCongeServiceImpl soldeCongeService;

    @BeforeEach
    void setUpSecurityContext() {
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                "amine.dupont@example.com",
                "n/a",
                List.of()
        );
        authentication.setDetails(Map.of(
                "userId", 24L,
                "entrepriseId", 13L
        ));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getByUtilisateurReturnsLegacyRowsForRequestedYear() {
        SoldeConge legacySolde = SoldeConge.builder()
                .id(5L)
                .utilisateurId(24L)
                .typeCongeId(1L)
                .annee(2026)
                .joursAcquis(30.0)
                .joursRestants(30.0)
                .joursUtilises(0.0)
                .joursEnAttente(0.0)
                .entrepriseId(null)
                .build();

        when(soldeCongeRepository.findByUtilisateurIdInAndAnnee(List.of(24L), 2026))
                .thenReturn(List.of(legacySolde));
        when(soldeCongeMapper.toDtoList(anyList()))
                .thenAnswer(invocation -> ((List<SoldeConge>) invocation.getArgument(0)).stream()
                        .map(solde -> SoldeCongeDTO.builder()
                                .id(solde.getId())
                                .utilisateurId(solde.getUtilisateurId())
                                .typeCongeId(solde.getTypeCongeId())
                                .annee(solde.getAnnee())
                                .joursAcquis(solde.getJoursAcquis())
                                .joursRestants(solde.getJoursRestants())
                                .joursUtilises(solde.getJoursUtilises())
                                .joursEnAttente(solde.getJoursEnAttente())
                                .build())
                        .toList());

        List<SoldeCongeDTO> response = soldeCongeService.getByUtilisateur(24L, 2026);

        assertNotNull(response);
        assertEquals(1, response.size());
        assertEquals(2026, response.get(0).getAnnee());
        assertEquals(30.0, response.get(0).getJoursRestants());
    }
}
