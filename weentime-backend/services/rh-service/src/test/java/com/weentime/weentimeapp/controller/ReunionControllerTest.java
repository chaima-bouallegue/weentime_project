package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.ConflictResponseDTO;
import com.weentime.weentimeapp.dto.ReunionDTO;
import com.weentime.weentimeapp.service.ReunionService;
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
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReunionControllerTest {

    @Mock
    private ReunionService service;

    @InjectMocks
    private ReunionController controller;

    @BeforeEach
    void setUp() {
        var auth = new UsernamePasswordAuthenticationToken("user@weentime.com", "pass");
        auth.setDetails(Map.of("userId", 10L, "entrepriseId", 20L));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void checkConflictsParsesCommaSeparatedIdsToList() {
        LocalDate date = LocalDate.of(2026, 9, 15);
        LocalTime start = LocalTime.of(9, 0);
        LocalTime end = LocalTime.of(10, 0);
        var conflictResp = new ConflictResponseDTO();

        when(service.checkConflicts(date, start, end, List.of(101L, 102L, 103L), 20L))
                .thenReturn(conflictResp);

        ResponseEntity<ConflictResponseDTO> response = controller.checkConflicts(date, start, end, "101,102,103");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isSameAs(conflictResp);
    }

    @Test
    void getMesReunionsAndProchaine() {
        var reunion = new ReunionDTO();
        when(service.getMesReunions(10L)).thenReturn(List.of(reunion));
        when(service.getProchaine(10L)).thenReturn(reunion);

        assertThat(controller.getMesReunions().getBody()).containsExactly(reunion);
        assertThat(controller.getProchaine().getBody()).isSameAs(reunion);
    }
}
