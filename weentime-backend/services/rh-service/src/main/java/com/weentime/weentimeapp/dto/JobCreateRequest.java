package com.weentime.weentimeapp.dto;

import lombok.Data;
import java.time.LocalDate;

@Data
public class JobCreateRequest {
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
}
