package com.weentime.weentimeapp;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.controller.DocumentController;
import com.weentime.weentimeapp.dto.UtilisateurAuthResponse;
import com.weentime.weentimeapp.exception.GlobalExceptionHandler;
import com.weentime.weentimeapp.service.AiService;
import com.weentime.weentimeapp.service.DocumentService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DocumentController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class DocumentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DocumentService documentService;

    @MockBean
    private OrganisationServiceClient organisationServiceClient;

    @MockBean
    private AiService aiService;

    @Test
    @WithMockUser(username = "rh@weentime.com", roles = "RH")
    void getDocumentDemandesWithPaginationReturnsEmptyPage() throws Exception {
        when(organisationServiceClient.getUtilisateurForAuth("rh@weentime.com"))
                .thenReturn(UtilisateurAuthResponse.builder().id(2L).email("rh@weentime.com").entrepriseId(3L).build());
        when(documentService.getDemandesEntreprise(3L)).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/documents/rh/demandes")
                        .param("page", "0")
                        .param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.number").value(0))
                .andExpect(jsonPath("$.data.size").value(100));
    }
}
