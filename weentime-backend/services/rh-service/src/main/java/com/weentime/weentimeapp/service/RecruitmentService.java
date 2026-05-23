package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.enums.ApplicationStatus;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface RecruitmentService {
    
    // --- Offres ---
    JobPostingDTO createJob(JobCreateRequest request, Long entrepriseId, Long creatorId);
    JobPostingDTO updateJob(Long id, JobCreateRequest request, Long entrepriseId);
    JobPostingDTO publishJob(Long id, Long entrepriseId);
    JobPostingDTO closeJob(Long id, Long entrepriseId);
    void deleteJob(Long id, Long entrepriseId);
    List<JobPostingDTO> getJobs(Long entrepriseId);
    JobPostingDTO getJob(Long id, Long entrepriseId);
    
    // --- Candidatures (RH) ---
    List<ApplicationDTO> getApplicationsByJob(Long jobId, Long entrepriseId);
    ApplicationDTO updateApplicationStatus(Long id, ApplicationStatus status, String reason, Long entrepriseId);
    void addNote(Long applicationId, String content, boolean isPrivate, Long authorId, Long entrepriseId);
    org.springframework.core.io.Resource getCvFile(Long applicationId, Long entrepriseId);
    
    // --- AI Callback ---
    void processAiResult(Long applicationId, java.util.Map<String, Object> aiResult);
    
    // --- Page Publique ---
    List<JobPostingDTO> getPublicJobs(String companySlug);
    JobPostingDTO getPublicJob(Long id);
    ApplicationDTO submitApplication(Long jobId, ApplicationRequest request, MultipartFile cvFile);
}
