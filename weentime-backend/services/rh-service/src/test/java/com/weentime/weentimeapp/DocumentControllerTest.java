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

    @MockBean
    private com.weentime.weentimeapp.repository.DocumentRepository documentRepository;

    @MockBean
    private com.weentime.weentimeapp.service.DocumentGeneratorService documentGeneratorService;

    @MockBean
    private com.weentime.weentimeapp.service.TemplateResolver templateResolver;

    @Test
    @WithMockUser(username = "rh@weentime.com", roles = "RH")
    void testDocumentsEmpty() throws Exception {
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

    @Test
    @WithMockUser(username = "emp@weentime.com", roles = "EMPLOYEE")
    void testUpdateDocumentSuccess() throws Exception {
        com.weentime.weentimeapp.dto.DemandeDocumentResponse response = com.weentime.weentimeapp.dto.DemandeDocumentResponse.builder()
                .id(10L)
                .type("ATTESTATION_TRAVAIL")
                .label("Attestation de travail")
                .statut(com.weentime.weentimeapp.enums.StatutDocument.DEMANDE_RECUE)
                .motif("Nouveau motif")
                .build();

        when(documentService.updateDemande(org.mockito.ArgumentMatchers.eq(10L), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("emp@weentime.com")))
                .thenReturn(response);

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/documents/10")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"ATTESTATION_TRAVAIL\",\"motif\":\"Nouveau motif\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(10))
                .andExpect(jsonPath("$.motif").value("Nouveau motif"));
    }

    @Test
    @WithMockUser(username = "emp@weentime.com", roles = "EMPLOYEE")
    void testAnnulerDocumentSuccess() throws Exception {
        when(organisationServiceClient.getUtilisateurForAuth("emp@weentime.com"))
                .thenReturn(UtilisateurAuthResponse.builder().id(5L).email("emp@weentime.com").build());

        com.weentime.weentimeapp.dto.DemandeDocumentResponse response = com.weentime.weentimeapp.dto.DemandeDocumentResponse.builder()
                .id(10L)
                .statut(com.weentime.weentimeapp.enums.StatutDocument.ANNULE)
                .build();

        when(documentService.annulerDemande(10L, 5L)).thenReturn(response);

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/documents/10/annuler"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(10))
                .andExpect(jsonPath("$.statut").value("ANNULE"));
    }

    @Test
    @WithMockUser(username = "emp@weentime.com", roles = "EMPLOYEE")
    void testCancelAliasSuccess() throws Exception {
        when(organisationServiceClient.getUtilisateurForAuth("emp@weentime.com"))
                .thenReturn(UtilisateurAuthResponse.builder().id(5L).email("emp@weentime.com").build());

        com.weentime.weentimeapp.dto.DemandeDocumentResponse response = com.weentime.weentimeapp.dto.DemandeDocumentResponse.builder()
                .id(10L)
                .statut(com.weentime.weentimeapp.enums.StatutDocument.ANNULE)
                .build();

        when(documentService.annulerDemande(10L, 5L)).thenReturn(response);

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/v1/documents/10/cancel"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(10))
                .andExpect(jsonPath("$.statut").value("ANNULE"));
    }
}
