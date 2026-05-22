package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.JobStatus;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class JobPostingDTO {
    private Long id;
    private String entrepriseName;
    private String title;
    private String department;
    private String employmentType;
    private String experienceLevel;
    private Integer minExperienceYears;
    private String requiredSkills;
    private String softSkills;
    private String description;
    private String responsibilities;
    private Integer salaryMin;
    private Integer salaryMax;
    private String salaryCurrency;
    private String workMode;
    private String location;
    private LocalDate deadline;
    private Integer openingsCount;
    private JobStatus status;
    private LocalDateTime publishedAt;
    private LocalDateTime createdAt;
}
