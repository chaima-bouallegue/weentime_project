package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.ApplicationStatus;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class ApplicationDTO {
    private Long id;
    private Long jobPostingId;
    private String jobTitle;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String linkedinUrl;
    private String cvOriginalFilename;
    private ApplicationStatus status;
    private String rejectionReason;
    private LocalDateTime submittedAt;
    
    // IA Matching — Enrichi
    private BigDecimal aiOverallScore;
    private BigDecimal aiTechnicalScore;
    private BigDecimal aiExperienceScore;
    private BigDecimal aiCompetenceScore;
    private String aiRecommendation;
    private String aiRecommendationSummary;
    private String aiPointsForts;
    private String aiPointsFaibles;
    private String aiCompetencesTrouvees;
    private String aiCompetencesManquantes;
    private Integer aiExperienceDetectee;
    private Integer aiNiveauConfiance;
    private String aiStatus;
}
