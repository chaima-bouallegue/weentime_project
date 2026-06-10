package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class AiRecruitmentResultRequest {

    @JsonProperty("application_id")
    private Long applicationId;

    @JsonProperty("entreprise_id")
    private Long entrepriseId;

    private String status;
    private String error;

    private Scores scores;

    private String recommandation;

    @JsonIgnore
    public boolean isFailure() {
        return "FAILED".equalsIgnoreCase(status);
    }

    @Data
    @NoArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Scores {

        @JsonProperty("score_global")
        private BigDecimal scoreGlobal;

        @JsonProperty("score_technique")
        private BigDecimal scoreTechnique;

        @JsonProperty("score_experience")
        private BigDecimal scoreExperience;

        @JsonProperty("score_competences")
        private BigDecimal scoreCompetences;

        private String recommandation;

        @JsonProperty("points_forts")
        private List<String> pointsForts;

        @JsonProperty("points_faibles")
        private List<String> pointsFaibles;

        @JsonProperty("resume_evaluation")
        private String resumeEvaluation;

        @JsonProperty("competences_trouvees")
        private List<String> competencesTrouvees;

        @JsonProperty("competences_manquantes")
        private List<String> competencesManquantes;

        @JsonProperty("annees_experience_detectees")
        private Integer anneesExperienceDetectees;

        @JsonProperty("niveau_confiance")
        private Integer niveauConfiance;
    }
}
