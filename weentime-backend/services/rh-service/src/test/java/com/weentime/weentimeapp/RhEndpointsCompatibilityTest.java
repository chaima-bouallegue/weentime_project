package com.weentime.weentimeapp;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.controller.AutorisationController;
import com.weentime.weentimeapp.controller.CongeController;
import com.weentime.weentimeapp.controller.TeletravailController;
import com.weentime.weentimeapp.dto.AutorisationDTO;
import com.weentime.weentimeapp.dto.CongeDTO;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.dto.TeletravailResponseDTO;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.exception.GlobalExceptionHandler;
import com.weentime.weentimeapp.service.AutorisationService;
import com.weentime.weentimeapp.service.CongeService;
import com.weentime.weentimeapp.service.TeletravailService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({CongeController.class, TeletravailController.class, AutorisationController.class})
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class RhEndpointsCompatibilityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private CongeService congeService;

    @MockBean
    private TeletravailService teletravailService;

    @MockBean
    private AutorisationService autorisationService;

    @MockBean
    private OrganisationServiceClient organisationServiceClient;

    @Test
    @WithMockUser(roles = "RH")
    void getCongesBasePathUsesRhPrefix() throws Exception {
        CongeDTO dto = CongeDTO.builder()
                .id(1L)
                .utilisateurId(7L)
                .statut(StatutDemandeEnum.EN_ATTENTE_RH)
                .dateCreation(LocalDateTime.parse("2026-04-16T18:30:00"))
                .build();

        when(congeService.getAll()).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/rh/conges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].dateCreation").value("2026-04-16T18:30:00"))
                .andExpect(jsonPath("$[0].createdAt").value("2026-04-16T18:30:00"))
                .andExpect(jsonPath("$[0].statut").value("EN_ATTENTE_RH"));

        verify(congeService).getAll();
    }

    @Test
    @WithMockUser(roles = "RH")
    void getTeletravailBasePathUsesRhPrefix() throws Exception {
        TeletravailResponseDTO dto = TeletravailResponseDTO.builder()
                .id(2L)
                .utilisateurId(9L)
                .statut(StatutDemandeEnum.APPROUVE)
                .dateCreation(LocalDateTime.parse("2026-04-16T19:00:00"))
                .build();

        when(teletravailService.getHistoriqueGlobal()).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/rh/teletravail"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].dateCreation").value("2026-04-16T19:00:00"))
                .andExpect(jsonPath("$[0].createdAt").value("2026-04-16T19:00:00"))
                .andExpect(jsonPath("$[0].statut").value("APPROUVEE"));

        verify(teletravailService).getHistoriqueGlobal();
    }

    @Test
    @WithMockUser(username = "rh@example.com", roles = "RH")
    void getAutorisationsBasePathUsesRhPrefix() throws Exception {
        AutorisationDTO dto = AutorisationDTO.builder()
                .id(3L)
                .utilisateurId(4L)
                .statut(StatutDemandeEnum.REFUSE)
                .dateCreation(LocalDateTime.parse("2026-04-16T19:15:00"))
                .build();

        PageResponse<AutorisationDTO> page = PageResponse.<AutorisationDTO>builder()
                .content(List.of(dto))
                .totalElements(1)
                .totalPages(1)
                .number(0)
                .size(20)
                .build();

        when(autorisationService.getRhHistory(anyString(), anyInt(), anyInt())).thenReturn(page);

        mockMvc.perform(get("/api/v1/rh/autorisations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].dateCreation").value("2026-04-16T19:15:00"))
                .andExpect(jsonPath("$.content[0].createdAt").value("2026-04-16T19:15:00"))
                .andExpect(jsonPath("$.content[0].statut").value("REFUSEE"))
                .andExpect(jsonPath("$.totalElements").value(1));

        verify(autorisationService).getRhHistory("rh@example.com", 0, 20);
    }
}
