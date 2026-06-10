package com.weentime.weentimeapp;

import com.weentime.weentimeapp.controller.TypeCongeController;
import com.weentime.weentimeapp.dto.TypeCongeDTO;
import com.weentime.weentimeapp.exception.GlobalExceptionHandler;
import com.weentime.weentimeapp.service.TypeCongeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TypeCongeController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class TypeCongeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TypeCongeService typeCongeService;

    @Test
    @WithMockUser(roles = "RH")
    void createTypeCongeReturnsCreated() throws Exception {
        TypeCongeDTO response = TypeCongeDTO.builder()
                .id(42L)
                .libelle("Conge maternite")
                .nombreJoursMax(90)
                .decompteJours(true)
                .requireJustificatif(true)
                .build();
        when(typeCongeService.create(org.mockito.ArgumentMatchers.any(TypeCongeDTO.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/rh/type-conges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "libelle": "Conge maternite",
                                  "joursMax": 90,
                                  "decompterJours": true,
                                  "justificatifExige": true
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(42))
                .andExpect(jsonPath("$.libelle").value("Conge maternite"))
                .andExpect(jsonPath("$.joursMax").value(90));
    }

    @Test
    @WithMockUser(roles = "RH")
    void duplicateTypeCongeReturnsConflict() throws Exception {
        when(typeCongeService.create(org.mockito.ArgumentMatchers.any(TypeCongeDTO.class)))
                .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Un type de conge avec ce libelle existe deja pour cette entreprise."));

        mockMvc.perform(post("/api/v1/rh/type-conges")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"libelle\":\"Conge maternite\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Un type de conge avec ce libelle existe deja pour cette entreprise."));
    }

    @Test
    @WithMockUser(roles = "RH")
    void testTypeCongeEmpty() throws Exception {
        when(typeCongeService.getAll()).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/rh/type-conges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @WithMockUser(roles = "RH")
    void getTypeCongesWithPaginationReturnsPageEnvelope() throws Exception {
        when(typeCongeService.getAll()).thenReturn(List.<TypeCongeDTO>of());

        mockMvc.perform(get("/api/v1/rh/type-conges")
                        .param("page", "0")
                        .param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.size").value(100));
    }

    @Test
    @WithMockUser(roles = "RH")
    void testMissingEntreprise() throws Exception {
        when(typeCongeService.getAll()).thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune entreprise associee a ce compte RH."));

        mockMvc.perform(get("/api/v1/rh/type-conges"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Aucune entreprise associee a ce compte RH."));
    }
}
