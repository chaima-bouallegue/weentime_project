package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.NotificationDTO;
import com.weentime.weentimeapp.dto.UtilisateurAuthResponse;
import com.weentime.weentimeapp.service.NotificationService;
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
class NotificationControllerTest {

    @Mock
    private NotificationService notificationService;

    @Mock
    private OrganisationServiceClient organisationServiceClient;

    @InjectMocks
    private NotificationController controller;

    private static final String USER_EMAIL = "user@weentime.com";

    @BeforeEach
    void setUp() {
        var auth = new UsernamePasswordAuthenticationToken(
                USER_EMAIL, "pass", List.of(new SimpleGrantedAuthority("ROLE_USER"), new SimpleGrantedAuthority("ROLE_RH"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getMesNotificationsReturnsList() {
        var userAuth = UtilisateurAuthResponse.builder().id(12L).entrepriseId(34L).build();
        when(organisationServiceClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(userAuth);
        var notif = new NotificationDTO();
        when(notificationService.getMesNotifications(eq(12L), eq(34L), anyList())).thenReturn(List.of(notif));

        ResponseEntity<List<NotificationDTO>> res = controller.getMesNotifications();
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).containsExactly(notif);
    }

    @Test
    void getUnreadCountReturnsCount() {
        var userAuth = UtilisateurAuthResponse.builder().id(12L).entrepriseId(34L).build();
        when(organisationServiceClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(userAuth);
        when(notificationService.countNonLues(12L, 34L)).thenReturn(5L);

        assertThat(controller.getUnreadCount().getBody()).isEqualTo(5L);
    }

    @Test
    void readAndClearEndpoints() {
        var userAuth = UtilisateurAuthResponse.builder().id(12L).entrepriseId(34L).build();
        when(organisationServiceClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(userAuth);

        assertThat(controller.marquerCommeLue(1L).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(notificationService).marquerCommeLue(1L, 12L, 34L);

        assertThat(controller.toutMarquerCommeLu().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(notificationService).toutMarquerCommeLu(12L, 34L);

        assertThat(controller.toutEffacer().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(notificationService).toutEffacer(12L, 34L);
    }

    @Test
    void getRhContextReturnsPayload() {
        var userAuth = UtilisateurAuthResponse.builder().id(12L).entrepriseId(34L).build();
        when(organisationServiceClient.getUtilisateurForAuth(USER_EMAIL)).thenReturn(userAuth);

        ResponseEntity<Map<String, Object>> res = controller.getRhContext();
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).containsEntry("userId", 12L);
        assertThat(res.getBody()).containsEntry("entrepriseId", 34L);
    }

    @Test
    void handlesNullOrFailedUserResolutionGracefully() {
        when(organisationServiceClient.getUtilisateurForAuth(USER_EMAIL)).thenThrow(new RuntimeException("Downstream error"));

        ResponseEntity<Long> res = controller.getUnreadCount();
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(notificationService).countNonLues(null, null);
    }
}
