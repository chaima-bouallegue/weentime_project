package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.ApplicationStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "applications")
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Application {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long entrepriseId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_posting_id", nullable = false)
    private JobPosting jobPosting;

    @Column(nullable = false, length = 100)
    private String firstName;

    @Column(nullable = false, length = 100)
    private String lastName;

    @Column(nullable = false)
    private String email;

    private String phone;

    private String linkedinUrl;

    private String cvStoragePath;
    private String cvOriginalFilename;

    @Builder.Default
    private boolean gdprConsent = false;
    private LocalDateTime gdprConsentAt;
    private LocalDate gdprRetentionUntil;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ApplicationStatus status = ApplicationStatus.APPLIED;

    private String rejectionReason;

    @Builder.Default
    private String source = "DIRECT";

    private LocalDateTime submittedAt;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    // --- IA Matching (Phase 2) ---
    private BigDecimal aiOverallScore;
    private BigDecimal aiTechnicalScore;
    private BigDecimal aiExperienceScore;
    private BigDecimal aiCompetenceScore;
    private String aiRecommendation;

    @Column(columnDefinition = "TEXT")
    private String aiRecommendationSummary;

    @Column(columnDefinition = "TEXT")
    private String aiPointsForts;           // JSON array

    @Column(columnDefinition = "TEXT")
    private String aiPointsFaibles;         // JSON array

    @Column(columnDefinition = "TEXT")
    private String aiCompetencesTrouvees;   // JSON array

    @Column(columnDefinition = "TEXT")
    private String aiCompetencesManquantes; // JSON array

    private Integer aiExperienceDetectee;
    private Integer aiNiveauConfiance;

    @Column(columnDefinition = "TEXT")
    private String aiAnalysisJson;

    @Builder.Default
    private String aiStatus = "PENDING";

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        this.submittedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
