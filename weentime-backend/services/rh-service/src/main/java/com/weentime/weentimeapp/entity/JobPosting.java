package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.JobStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "job_postings")
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobPosting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long entrepriseId;

    private String entrepriseName;

    @Column(nullable = false, length = 200)
    private String title;

    private String department;

    @Column(name = "employment_type")
    private String employmentType; // e.g., FULL_TIME, PART_TIME

    @Column(name = "experience_level")
    private String experienceLevel; // e.g., JUNIOR, MID, SENIOR

    private Integer minExperienceYears;

    @Column(columnDefinition = "TEXT")
    private String requiredSkills;

    @Column(columnDefinition = "TEXT")
    private String softSkills;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(columnDefinition = "TEXT")
    private String responsibilities;

    private Integer salaryMin;
    private Integer salaryMax;

    @Builder.Default
    private String salaryCurrency = "EUR";

    @Column(name = "work_mode")
    private String workMode; // ONSITE, HYBRID, REMOTE

    private String location;

    private LocalDate deadline;

    @Builder.Default
    private Integer openingsCount = 1;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private JobStatus status = JobStatus.DRAFT;

    private LocalDateTime publishedAt;

    private Long createdBy;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
