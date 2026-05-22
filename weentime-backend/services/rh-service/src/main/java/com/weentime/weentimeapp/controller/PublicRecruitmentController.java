package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.service.RecruitmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/v1/public/recrutement")
@RequiredArgsConstructor
@Slf4j
public class PublicRecruitmentController {

    private final RecruitmentService recruitmentService;

    @GetMapping("/jobs")
    public ResponseEntity<List<JobPostingDTO>> getPublicJobs(@RequestParam(required = false) String company) {
        return ResponseEntity.ok(recruitmentService.getPublicJobs(company));
    }

    @GetMapping("/jobs/{id}")
    public ResponseEntity<JobPostingDTO> getPublicJob(@PathVariable Long id) {
        return ResponseEntity.ok(recruitmentService.getPublicJob(id));
    }

    @PostMapping(value = "/jobs/{id}/apply", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApplicationDTO> apply(
            @PathVariable Long id,
            @RequestPart("data") ApplicationRequest request,
            @RequestPart("cv") MultipartFile cvFile) {
        
        if (cvFile.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le CV est obligatoire.");
        }
        
        // Simple validation du type de fichier
        String contentType = cvFile.getContentType();
        if (contentType == null || (!contentType.equals("application/pdf") && !contentType.contains("word"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Seuls les fichiers PDF et Word sont acceptés.");
        }

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(recruitmentService.submitApplication(id, request, cvFile));
    }
}
