package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.enums.ApplicationStatus;
import com.weentime.weentimeapp.service.RecruitmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/recrutement")
@RequiredArgsConstructor
@Slf4j
public class RecruitmentController {

    private final RecruitmentService recruitmentService;
    private final OrganisationServiceClient organisationServiceClient;

    // --- Gestion des Offres ---

    @PostMapping("/jobs")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<JobPostingDTO> createJob(@RequestBody JobCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(recruitmentService.createJob(request, getEntrepriseId(), getUserId()));
    }

    @GetMapping("/jobs")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<List<JobPostingDTO>> getJobs() {
        return ResponseEntity.ok(recruitmentService.getJobs(getEntrepriseId()));
    }

    @GetMapping("/jobs/{id}")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<JobPostingDTO> getJob(@PathVariable Long id) {
        return ResponseEntity.ok(recruitmentService.getJob(id, getEntrepriseId()));
    }

    @PutMapping("/jobs/{id}")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<JobPostingDTO> updateJob(@PathVariable Long id, @RequestBody JobCreateRequest request) {
        return ResponseEntity.ok(recruitmentService.updateJob(id, request, getEntrepriseId()));
    }

    @PostMapping("/jobs/{id}/publish")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<JobPostingDTO> publishJob(@PathVariable Long id) {
        return ResponseEntity.ok(recruitmentService.publishJob(id, getEntrepriseId()));
    }

    @PostMapping("/jobs/{id}/close")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<JobPostingDTO> closeJob(@PathVariable Long id) {
        return ResponseEntity.ok(recruitmentService.closeJob(id, getEntrepriseId()));
    }

    @DeleteMapping("/jobs/{id}")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<Void> deleteJob(@PathVariable Long id) {
        recruitmentService.deleteJob(id, getEntrepriseId());
        return ResponseEntity.noContent().build();
    }

    // --- Gestion des Candidatures ---

    @GetMapping("/jobs/{id}/applications")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<List<ApplicationDTO>> getApplications(@PathVariable Long id) {
        return ResponseEntity.ok(recruitmentService.getApplicationsByJob(id, getEntrepriseId()));
    }

    @PatchMapping("/applications/{id}/status")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<ApplicationDTO> updateStatus(
            @PathVariable Long id,
            @RequestParam ApplicationStatus status,
            @RequestParam(required = false) String reason) {
        return ResponseEntity.ok(recruitmentService.updateApplicationStatus(id, status, reason, getEntrepriseId()));
    }

    @PostMapping("/applications/{id}/notes")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<Void> addNote(
            @PathVariable Long id,
            @RequestBody java.util.Map<String, Object> body) {
        String content = (String) body.get("content");
        boolean isPrivate = (boolean) body.getOrDefault("isPrivate", false);
        recruitmentService.addNote(id, content, isPrivate, getUserId(), getEntrepriseId());
        return ResponseEntity.ok().build();
    }

    @GetMapping("/applications/{id}/cv")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<org.springframework.core.io.Resource> getCv(@PathVariable Long id) {
        org.springframework.core.io.Resource resource = recruitmentService.getCvFile(id, getEntrepriseId());
        return ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.APPLICATION_PDF)
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }

    // --- Helpers ---

    private Long getEntrepriseId() {
        return com.weentime.weentimeapp.security.SecurityUtils.getCurrentEntrepriseId();
    }

    private Long getUserId() {
        return com.weentime.weentimeapp.security.SecurityUtils.getCurrentUserId();
    }
}
