package com.weentime.weentimeapp;

import com.weentime.weentimeapp.controller.DemandeController;
import com.weentime.weentimeapp.dto.DemandeDTO;
import com.weentime.weentimeapp.exception.GlobalExceptionHandler;
import com.weentime.weentimeapp.service.DemandeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DemandeController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class DemandeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DemandeService demandeService;

    @Test
    @WithMockUser(roles = "RH")
    void getDemandesWithEnAttenteRhFilterReturnsEmptyPage() throws Exception {
        when(demandeService.getAllForEntreprise(isNull())).thenReturn(List.<DemandeDTO>of());

        mockMvc.perform(get("/api/v1/rh/demandes")
                        .param("page", "0")
                        .param("size", "100")
                        .param("statut", "EN_ATTENTE_RH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.number").value(0))
                .andExpect(jsonPath("$.data.size").value(100));
    }

    @Test
    @WithMockUser(roles = "RH")
    void testEnumEmpty() throws Exception {
        when(demandeService.getAllForEntreprise(isNull())).thenReturn(List.<DemandeDTO>of());

        mockMvc.perform(get("/api/v1/rh/demandes")
                        .param("page", "0")
                        .param("size", "100")
                        .param("statut", "INVALIDE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }
}
