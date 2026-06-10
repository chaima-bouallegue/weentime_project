package com.weentime.weentimeapp.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.weentimeapp.client.EntrepriseServiceClient;
import com.weentime.weentimeapp.dto.AiRecruitmentResultRequest;
import com.weentime.weentimeapp.entity.Application;
import com.weentime.weentimeapp.entity.JobPosting;
import com.weentime.weentimeapp.enums.ApplicationStatus;
import com.weentime.weentimeapp.mapper.RecruitmentMapper;
import com.weentime.weentimeapp.repository.ApplicationRepository;
import com.weentime.weentimeapp.repository.CandidateNoteRepository;
import com.weentime.weentimeapp.repository.JobPostingRepository;
import com.weentime.weentimeapp.service.AiService;
import com.weentime.weentimeapp.service.NotificationSender;
import com.weentime.weentimeapp.service.RecruitmentEmailService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecruitmentServiceImplTest {

    @Mock
    private JobPostingRepository jobPostingRepository;
    @Mock
    private ApplicationRepository applicationRepository;
    @Mock
    private CandidateNoteRepository noteRepository;
    @Mock
    private RecruitmentMapper mapper;
    @Mock
    private AiService aiService;
    @Mock
    private EntrepriseServiceClient entrepriseServiceClient;
    @Mock
    private NotificationSender notificationSender;
    @Mock
    private RecruitmentEmailService emailService;

    private RecruitmentServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new RecruitmentServiceImpl(
                jobPostingRepository,
                applicationRepository,
                noteRepository,
                mapper,
                aiService,
                entrepriseServiceClient,
                notificationSender,
                emailService,
                new ObjectMapper()
        );
    }

    @Test
    void processAiResultPersistsScoresAndCompletesAnalysis() {
        Application application = application(ApplicationStatus.AI_ANALYZING);
        AiRecruitmentResultRequest request = successRequest();
        when(applicationRepository.findById(3L)).thenReturn(Optional.of(application));

        service.processAiResult(3L, request);

        assertThat(application.getAiOverallScore()).isEqualByComparingTo("45");
        assertThat(application.getAiTechnicalScore()).isEqualByComparingTo("50");
        assertThat(application.getAiExperienceScore()).isEqualByComparingTo("30");
        assertThat(application.getAiCompetenceScore()).isEqualByComparingTo("60");
        assertThat(application.getAiRecommendation()).isEqualTo("A_EVALUER");
        assertThat(application.getAiRecommendationSummary()).isEqualTo("Profil à approfondir.");
        assertThat(application.getAiPointsForts()).isEqualTo("[\"Python\"]");
        assertThat(application.getAiPointsFaibles()).isEqualTo("[\"Expérience\"]");
        assertThat(application.getAiNiveauConfiance()).isEqualTo(80);
        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.AI_ANALYZED);
        assertThat(application.getAiStatus()).isEqualTo("COMPLETED");
        assertThat(application.getAiAnalysisJson()).contains("\"application_id\":3");
        verify(applicationRepository).save(application);
    }

    @Test
    void processAiResultAcceptsMinimalFailureAndRestoresAppliedStatus() {
        Application application = application(ApplicationStatus.AI_ANALYZING);
        AiRecruitmentResultRequest request = new AiRecruitmentResultRequest();
        request.setApplicationId(3L);
        request.setEntrepriseId(13L);
        request.setStatus("FAILED");
        request.setError("Réponse IA malformée");
        when(applicationRepository.findById(3L)).thenReturn(Optional.of(application));

        service.processAiResult(3L, request);

        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(application.getAiStatus()).isEqualTo("FAILED");
        assertThat(application.getAiAnalysisJson()).contains("Réponse IA malformée");
        verify(applicationRepository).save(application);
        verify(notificationSender, never()).sendToRole(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any()
        );
    }

    @Test
    void processAiResultDoesNotRegressAdvancedWorkflowStatus() {
        Application application = application(ApplicationStatus.UNDER_REVIEW);
        when(applicationRepository.findById(3L)).thenReturn(Optional.of(application));

        service.processAiResult(3L, successRequest());

        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.UNDER_REVIEW);
        assertThat(application.getAiStatus()).isEqualTo("COMPLETED");
    }

    @Test
    void processAiResultRejectsTenantMismatch() {
        Application application = application(ApplicationStatus.AI_ANALYZING);
        AiRecruitmentResultRequest request = successRequest();
        request.setEntrepriseId(99L);
        when(applicationRepository.findById(3L)).thenReturn(Optional.of(application));

        assertThatThrownBy(() -> service.processAiResult(3L, request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);

        verify(applicationRepository, never()).save(application);
    }

    @Test
    void processAiResultRejectsSuccessWithoutScores() {
        Application application = application(ApplicationStatus.AI_ANALYZING);
        AiRecruitmentResultRequest request = new AiRecruitmentResultRequest();
        request.setApplicationId(3L);
        request.setEntrepriseId(13L);
        when(applicationRepository.findById(3L)).thenReturn(Optional.of(application));

        assertThatThrownBy(() -> service.processAiResult(3L, request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void processAiResultRejectsMissingEntrepriseId() {
        Application application = application(ApplicationStatus.AI_ANALYZING);
        AiRecruitmentResultRequest request = successRequest();
        request.setEntrepriseId(null);
        when(applicationRepository.findById(3L)).thenReturn(Optional.of(application));

        assertThatThrownBy(() -> service.processAiResult(3L, request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private Application application(ApplicationStatus status) {
        return Application.builder()
                .id(3L)
                .entrepriseId(13L)
                .jobPosting(JobPosting.builder().id(7L).build())
                .status(status)
                .aiStatus("ANALYZING")
                .build();
    }

    private AiRecruitmentResultRequest successRequest() {
        AiRecruitmentResultRequest.Scores scores = new AiRecruitmentResultRequest.Scores();
        scores.setScoreGlobal(new BigDecimal("45"));
        scores.setScoreTechnique(new BigDecimal("50"));
        scores.setScoreExperience(new BigDecimal("30"));
        scores.setScoreCompetences(new BigDecimal("60"));
        scores.setRecommandation("A_EVALUER");
        scores.setPointsForts(List.of("Python"));
        scores.setPointsFaibles(List.of("Expérience"));
        scores.setResumeEvaluation("Profil à approfondir.");
        scores.setCompetencesTrouvees(List.of("Python"));
        scores.setCompetencesManquantes(List.of("Spring"));
        scores.setNiveauConfiance(80);

        AiRecruitmentResultRequest request = new AiRecruitmentResultRequest();
        request.setApplicationId(3L);
        request.setEntrepriseId(13L);
        request.setScores(scores);
        request.setRecommandation("A_EVALUER");
        return request;
    }
}
