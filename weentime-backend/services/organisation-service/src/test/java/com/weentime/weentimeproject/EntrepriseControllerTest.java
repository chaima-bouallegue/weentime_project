package com.weentime.weentimeproject;

import com.weentime.weentimeproject.controller.EntrepriseController;
import com.weentime.weentimeproject.dto.EntrepriseValidationDTO;
import com.weentime.weentimeproject.service.EntrepriseService;
import com.weentime.weentimeproject.service.EntrepriseAccessControlService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class EntrepriseControllerTest {

    @Mock
    private EntrepriseService entrepriseService;

    @Mock
    private EntrepriseAccessControlService accessControlService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new EntrepriseController(entrepriseService, accessControlService)).build();
    }

    @Test
    void shouldReturnOkForActiveInvitationCode() throws Exception {
        when(entrepriseService.validateCode("WEEN-22024"))
                .thenReturn(EntrepriseValidationDTO.builder()
                        .valid(true)
                        .enterpriseId(123L)
                        .enterpriseName("Weentime SARL")
                        .status("ACTIVE")
                        .invitationCode("WEEN-22024")
                        .build());

        mockMvc.perform(get("/api/v1/organisations/entreprises/validate-code/WEEN-22024"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.enterpriseId").value(123))
                .andExpect(jsonPath("$.enterpriseName").value("Weentime SARL"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.invitationCode").value("WEEN-22024"));
    }

    @Test
    void shouldReturnConflictForClosedEnterpriseCode() throws Exception {
        when(entrepriseService.validateCode("WEEN-CLOSED"))
                .thenReturn(EntrepriseValidationDTO.builder()
                        .valid(false)
                        .reason("ENTERPRISE_CLOSED")
                        .message("Cette entreprise est fermée. Contactez votre administrateur.")
                        .build());

        mockMvc.perform(get("/api/v1/organisations/entreprises/validate-code/WEEN-CLOSED"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.reason").value("ENTERPRISE_CLOSED"))
                .andExpect(jsonPath("$.message").value("Cette entreprise est fermée. Contactez votre administrateur."));
    }

    @Test
    void shouldReturnNotFoundForUnknownCode() throws Exception {
        when(entrepriseService.validateCode("INVALID-CODE"))
                .thenReturn(EntrepriseValidationDTO.builder()
                        .valid(false)
                        .reason("CODE_NOT_FOUND")
                        .message("Code d'invitation invalide ou expiré.")
                        .build());

        mockMvc.perform(get("/api/v1/organisations/entreprises/validate-code/INVALID-CODE"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.reason").value("CODE_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Code d'invitation invalide ou expiré."));
    }
}
