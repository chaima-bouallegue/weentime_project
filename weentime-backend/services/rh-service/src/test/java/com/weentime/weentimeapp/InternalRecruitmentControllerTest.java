package com.weentime.weentimeapp;

import com.weentime.weentimeapp.config.SecurityConfig;
import com.weentime.weentimeapp.controller.InternalRecruitmentController;
import com.weentime.weentimeapp.dto.AiRecruitmentResultRequest;
import com.weentime.weentimeapp.security.JwtUtils;
import com.weentime.weentimeapp.service.RecruitmentService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(InternalRecruitmentController.class)
@Import(SecurityConfig.class)
@TestPropertySource(properties = "weentime.internal.secret=test-internal-secret")
class InternalRecruitmentControllerTest {

    private static final String CALLBACK_PATH =
            "/api/v1/internal/recruitment/applications/3/ai-result";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RecruitmentService recruitmentService;

    @MockBean
    private JwtUtils jwtUtils;

    @Test
    void callbackAcceptsSuccessPayloadWithoutUserJwt() throws Exception {
        mockMvc.perform(post(CALLBACK_PATH)
                        .header("X-Internal-Secret", "test-internal-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(successPayload()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("saved"));

        var captor = org.mockito.ArgumentCaptor.forClass(AiRecruitmentResultRequest.class);
        verify(recruitmentService).processAiResult(eq(3L), captor.capture());
        assertThat(captor.getValue().getApplicationId()).isEqualTo(3L);
        assertThat(captor.getValue().getEntrepriseId()).isEqualTo(13L);
        assertThat(captor.getValue().getScores().getScoreGlobal())
                .isEqualByComparingTo("45");
        assertThat(captor.getValue().getScores().getPointsForts())
                .containsExactly("Python");
    }

    @Test
    void callbackAcceptsMinimalFailurePayload() throws Exception {
        mockMvc.perform(post(CALLBACK_PATH)
                        .header("X-Internal-Secret", "test-internal-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "application_id": 3,
                                  "entreprise_id": 13,
                                  "status": "FAILED",
                                  "error": "Réponse IA malformée"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("saved"));

        verify(recruitmentService).processAiResult(eq(3L), any(AiRecruitmentResultRequest.class));
    }

    @Test
    void callbackRejectsMissingSecretWithForbidden() throws Exception {
        mockMvc.perform(post(CALLBACK_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value("error"));

        verify(recruitmentService, never()).processAiResult(eq(3L), any());
    }

    @Test
    void callbackRejectsInvalidSecretWithForbidden() throws Exception {
        mockMvc.perform(post(CALLBACK_PATH)
                        .header("X-Internal-Secret", "wrong-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(successPayload()))
                .andExpect(status().isForbidden());

        verify(recruitmentService, never()).processAiResult(eq(3L), any());
    }

    @Test
    void callbackPreservesServiceHttpStatus() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Candidature introuvable"))
                .when(recruitmentService)
                .processAiResult(eq(3L), any(AiRecruitmentResultRequest.class));

        mockMvc.perform(post(CALLBACK_PATH)
                        .header("X-Internal-Secret", "test-internal-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(successPayload()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Candidature introuvable"));
    }

    private String successPayload() {
        return """
                {
                  "application_id": 3,
                  "entreprise_id": 13,
                  "scores": {
                    "score_global": 45,
                    "score_technique": 50,
                    "score_experience": 30,
                    "score_competences": 60,
                    "recommandation": "A_EVALUER",
                    "points_forts": ["Python"],
                    "points_faibles": ["Expérience"],
                    "resume_evaluation": "Profil à approfondir.",
                    "competences_trouvees": ["Python"],
                    "competences_manquantes": ["Spring"],
                    "annees_experience_detectees": null,
                    "niveau_confiance": 80
                  },
                  "recommandation": "A_EVALUER"
                }
                """;
    }
}
