package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.service.TeletravailService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TeletravailControllerTest {

    @Mock
    private TeletravailService service;

    @Mock
    private OrganisationServiceClient organisationClient;

    @InjectMocks
    private TeletravailController controller;

    private static final String USER_EMAIL = "collab@weentime.com";

    @BeforeEach
    void setUp() {
        var auth = new UsernamePasswordAuthenticationToken(
                USER_EMAIL, "pass", List.of(new SimpleGrantedAuthority("ROLE_EMPLOYEE"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createReturnsCreatedStatus() {
        var dto = new TeletravailCreateDTO();
        var responseDto = new TeletravailResponseDTO();
        when(service.create(dto, USER_EMAIL)).thenReturn(responseDto);

        ResponseEntity<TeletravailResponseDTO> res = controller.create(dto);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(res.getBody()).isSameAs(responseDto);
    }

    @Test
    void updateReturnsOkStatus() {
        var dto = new TeletravailCreateDTO();
        var responseDto = new TeletravailResponseDTO();
        when(service.update(10L, dto, USER_EMAIL)).thenReturn(responseDto);

        ResponseEntity<TeletravailResponseDTO> res = controller.update(10L, dto);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).isSameAs(responseDto);
    }

    @Test
    void getAllDispatchesAccordingToRole() {
        // Employee
        when(service.getMesDemandes(USER_EMAIL)).thenReturn(List.of());
        ResponseEntity<List<TeletravailResponseDTO>> empRes = controller.getAll();
        assertThat(empRes.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(service).getMesDemandes(USER_EMAIL);

        // Manager
        var mgrAuth = new UsernamePasswordAuthenticationToken(
                USER_EMAIL, "pass", List.of(new SimpleGrantedAuthority("ROLE_MANAGER"))
        );
        SecurityContextHolder.getContext().setAuthentication(mgrAuth);
        when(service.getDemandesEquipe(USER_EMAIL)).thenReturn(List.of());
        ResponseEntity<List<TeletravailResponseDTO>> mgrRes = controller.getAll();
        assertThat(mgrRes.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(service).getDemandesEquipe(USER_EMAIL);

        // RH
        var rhAuth = new UsernamePasswordAuthenticationToken(
                USER_EMAIL, "pass", List.of(new SimpleGrantedAuthority("ROLE_RH"))
        );
        SecurityContextHolder.getContext().setAuthentication(rhAuth);
        when(service.getHistoriqueGlobal()).thenReturn(List.of());
        ResponseEntity<List<TeletravailResponseDTO>> rhRes = controller.getAll();
        assertThat(rhRes.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(service).getHistoriqueGlobal();
    }

    @Test
    void getByIdAndMesDemandes() {
        var responseDto = new TeletravailResponseDTO();
        when(service.getById(5L)).thenReturn(responseDto);
        when(service.getMesDemandes(USER_EMAIL)).thenReturn(List.of(responseDto));

        assertThat(controller.getById(5L).getBody()).isSameAs(responseDto);
        assertThat(controller.getMesDemandes().getBody()).containsExactly(responseDto);
    }

    @Test
    void quotasAndAnnuler() {
        var quota = new QuotaTeletravailDTO();
        when(service.getQuota(USER_EMAIL)).thenReturn(quota);
        when(service.getQuota(10L, USER_EMAIL)).thenReturn(quota);
        var cancelled = new TeletravailResponseDTO();
        when(service.annuler(5L, USER_EMAIL)).thenReturn(cancelled);

        assertThat(controller.getQuota().getBody()).isSameAs(quota);
        assertThat(controller.getQuotaByCollaborateur(10L).getBody()).isSameAs(quota);
        assertThat(controller.annuler(5L).getBody()).isSameAs(cancelled);
    }

    @Test
    void managerEndpoints() {
        when(service.getDemandesEquipe(USER_EMAIL)).thenReturn(List.of());
        when(service.getMesDecisions(USER_EMAIL)).thenReturn(List.of());
        when(service.getStatsManager(USER_EMAIL)).thenReturn(new StatsManagerDTO());

        assertThat(controller.getDemandesEquipe().getBody()).isEmpty();
        assertThat(controller.getMesDecisions().getBody()).isEmpty();
        assertThat(controller.getStatsManager().getBody()).isNotNull();
    }

    @Test
    void validerManagerWithAndWithoutCommentaire() {
        var userAuth = UtilisateurAuthResponse.builder().id(77L).build();
        when(organisationClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(userAuth);
        var resp = new TeletravailResponseDTO();
        when(service.validerManager(1L, 77L, "OK manager")).thenReturn(resp);
        when(service.validerManager(2L, 77L, null)).thenReturn(resp);

        assertThat(controller.validerManager(1L, Map.of("commentaire", "OK manager")).getBody()).isSameAs(resp);
        assertThat(controller.validerManager(2L, null).getBody()).isSameAs(resp);
    }

    @Test
    void rejeterManagerWithAndWithoutCommentaire() {
        var userAuth = UtilisateurAuthResponse.builder().id(77L).build();
        when(organisationClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(userAuth);
        var resp = new TeletravailResponseDTO();
        when(service.rejeterManager(1L, 77L, "Refus")).thenReturn(resp);
        when(service.rejeterManager(2L, 77L, null)).thenReturn(resp);

        assertThat(controller.rejeterManager(1L, Map.of("commentaire", "Refus")).getBody()).isSameAs(resp);
        assertThat(controller.rejeterManager(2L, null).getBody()).isSameAs(resp);
    }

    @Test
    void rhEndpoints() {
        when(service.getEnAttenteRh()).thenReturn(List.of());
        when(service.getHistoriqueGlobal()).thenReturn(List.of());
        when(service.getStatsRh()).thenReturn(new StatsRhDTO());

        assertThat(controller.getEnAttenteRh().getBody()).isEmpty();
        assertThat(controller.getHistoriqueGlobal().getBody()).isEmpty();
        assertThat(controller.getStatsRh().getBody()).isNotNull();
    }

    @Test
    void validerAndRejeterRhWithAndWithoutCommentaire() {
        var resp = new TeletravailResponseDTO();
        when(service.validerRH(1L, "OK RH")).thenReturn(resp);
        when(service.validerRH(2L, null)).thenReturn(resp);
        when(service.rejeterRH(3L, "Refus RH")).thenReturn(resp);
        when(service.rejeterRH(4L, null)).thenReturn(resp);

        assertThat(controller.validerRH(1L, Map.of("commentaire", "OK RH")).getBody()).isSameAs(resp);
        assertThat(controller.validerRH(2L, null).getBody()).isSameAs(resp);
        assertThat(controller.rejeterRH(3L, Map.of("commentaire", "Refus RH")).getBody()).isSameAs(resp);
        assertThat(controller.rejeterRH(4L, null).getBody()).isSameAs(resp);
    }
}
