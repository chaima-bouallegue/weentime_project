package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.entity.*;
import com.weentime.weentimeapp.enums.*;
import com.weentime.weentimeapp.mapper.RecruitmentMapper;
import com.weentime.weentimeapp.repository.*;
import com.weentime.weentimeapp.service.RecruitmentService;
import com.weentime.weentimeapp.service.RecruitmentEmailService;
import com.weentime.weentimeapp.service.NotificationSender;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.weentime.weentimeapp.service.AiService;

@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
public class RecruitmentServiceImpl implements RecruitmentService {

    private final JobPostingRepository jobPostingRepository;
    private final ApplicationRepository applicationRepository;
    private final CandidateNoteRepository noteRepository;
    private final RecruitmentMapper mapper;
    private final AiService aiService;
    private final com.weentime.weentimeapp.client.EntrepriseServiceClient entrepriseServiceClient;
    private final NotificationSender notificationSender;
    private final RecruitmentEmailService emailService;

    @Override
    public JobPostingDTO createJob(JobCreateRequest request, Long entrepriseId, Long creatorId) {
        JobPosting job = mapper.toEntity(request);
        job.setEntrepriseId(entrepriseId);
        job.setCreatedBy(creatorId);
        job.setStatus(JobStatus.DRAFT);
        
        try {
            com.weentime.weentimeapp.dto.EntrepriseResponse entreprise = entrepriseServiceClient.getEntrepriseById(entrepriseId);
            if (entreprise != null) {
                job.setEntrepriseName(entreprise.getNom());
            }
        } catch (Exception e) {
            log.error("Erreur lors de la récupération du nom de l'entreprise : {}", e.getMessage());
            // On continue quand même, le nom pourra être mis à jour plus tard ou rester vide
        }
        
        return mapper.toDto(jobPostingRepository.save(job));
    }

    @Override
    public JobPostingDTO updateJob(Long id, JobCreateRequest request, Long entrepriseId) {
        log.info("Demande de modification de l'offre {} pour l'entreprise {}", id, entrepriseId);
        JobPosting job = jobPostingRepository.findByIdAndEntrepriseId(id, entrepriseId)
                .orElseThrow(() -> {
                    log.error("Modification échouée : Offre {} introuvable pour l'entreprise {}", id, entrepriseId);
                    return new ResponseStatusException(HttpStatus.NOT_FOUND, "Offre introuvable");
                });
        
        // Mise à jour manuelle pour éviter d'écraser les métadonnées
        job.setTitle(request.getTitle());
        job.setDepartment(request.getDepartment());
        job.setEmploymentType(request.getEmploymentType());
        job.setExperienceLevel(request.getExperienceLevel());
        job.setMinExperienceYears(request.getMinExperienceYears());
        job.setRequiredSkills(request.getRequiredSkills());
        job.setSoftSkills(request.getSoftSkills());
        job.setDescription(request.getDescription());
        job.setResponsibilities(request.getResponsibilities());
        job.setSalaryMin(request.getSalaryMin());
        job.setSalaryMax(request.getSalaryMax());
        job.setSalaryCurrency(request.getSalaryCurrency());
        job.setWorkMode(request.getWorkMode());
        job.setLocation(request.getLocation());
        job.setDeadline(request.getDeadline());
        job.setOpeningsCount(request.getOpeningsCount());
        
        return mapper.toDto(jobPostingRepository.save(job));
    }

    @Override
    public JobPostingDTO publishJob(Long id, Long entrepriseId) {
        JobPosting job = jobPostingRepository.findByIdAndEntrepriseId(id, entrepriseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offre introuvable"));
        job.setStatus(JobStatus.PUBLISHED);
        job.setPublishedAt(LocalDateTime.now());
        return mapper.toDto(jobPostingRepository.save(job));
    }

    @Override
    public JobPostingDTO closeJob(Long id, Long entrepriseId) {
        JobPosting job = jobPostingRepository.findByIdAndEntrepriseId(id, entrepriseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offre introuvable"));
        job.setStatus(JobStatus.CLOSED);
        return mapper.toDto(jobPostingRepository.save(job));
    }

    @Override
    public void deleteJob(Long id, Long entrepriseId) {
        log.info("Demande de suppression de l'offre {} pour l'entreprise {}", id, entrepriseId);
        JobPosting job = jobPostingRepository.findByIdAndEntrepriseId(id, entrepriseId)
                .orElseThrow(() -> {
                    log.error("Suppression échouée : Offre {} introuvable pour l'entreprise {}", id, entrepriseId);
                    return new ResponseStatusException(HttpStatus.NOT_FOUND, "Offre introuvable");
                });
        
        log.info("Offre {} trouvée. Passage au statut ARCHIVED.", id);
        job.setStatus(JobStatus.ARCHIVED);
        jobPostingRepository.save(job);
        log.info("Offre {} archivée avec succès.", id);
    }

    @Override
    public List<JobPostingDTO> getJobs(Long entrepriseId) {
        return mapper.toJobDtoList(jobPostingRepository.findByEntrepriseIdOrderByCreatedAtDesc(entrepriseId));
    }

    @Override
    public JobPostingDTO getJob(Long id, Long entrepriseId) {
        return jobPostingRepository.findByIdAndEntrepriseId(id, entrepriseId)
                .map(mapper::toDto)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offre introuvable"));
    }

    @Override
    public List<ApplicationDTO> getApplicationsByJob(Long jobId, Long entrepriseId) {
        // Vérifier d'abord que le job appartient à l'entreprise
        jobPostingRepository.findByIdAndEntrepriseId(jobId, entrepriseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offre introuvable"));
        
        return mapper.toAppDtoList(applicationRepository.findByJobPostingIdOrderBySubmittedAtDesc(jobId));
    }

    @Override
    public ApplicationDTO updateApplicationStatus(Long id, ApplicationStatus status, String reason, Long entrepriseId) {
        Application app = applicationRepository.findByIdAndEntrepriseId(id, entrepriseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Candidature introuvable"));
        
        app.setStatus(status);
        app.setRejectionReason(reason);
        Application saved = applicationRepository.save(app);

        // Envoi d'emails selon le nouveau statut (non bloquant, @Async)
        String entrepriseName = saved.getJobPosting() != null ? saved.getJobPosting().getEntrepriseName() : null;
        String jobTitle = saved.getJobPosting() != null ? saved.getJobPosting().getTitle() : "";
        try {
            if (status == ApplicationStatus.SHORTLISTED) {
                emailService.sendShortlistedNotification(
                    saved.getEmail(), saved.getFirstName(), jobTitle, entrepriseName);
            } else if (status == ApplicationStatus.REJECTED) {
                emailService.sendRejectionNotification(
                    saved.getEmail(), saved.getFirstName(), jobTitle, entrepriseName);
            }
        } catch (Exception e) {
            log.warn("Email non envoyé pour candidature #{}: {}", id, e.getMessage());
        }

        return mapper.toDto(saved);
    }

    @Override
    public void addNote(Long applicationId, String content, boolean isPrivate, Long authorId, Long entrepriseId) {
        Application app = applicationRepository.findByIdAndEntrepriseId(applicationId, entrepriseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Candidature introuvable"));
        
        CandidateNote note = CandidateNote.builder()
                .application(app)
                .entrepriseId(entrepriseId)
                .authorId(authorId)
                .content(content)
                .isPrivate(isPrivate)
                .build();
        noteRepository.save(note);
    }

    @Override
    public List<JobPostingDTO> getPublicJobs(String companySlug) {
        // Pour le MVP, on retourne tous les jobs publiés du système. 
        // En production, on filtrerait par entreprise via le slug.
        // TODO: Implémenter le filtrage par slug entreprise
        return mapper.toJobDtoList(jobPostingRepository.findAll().stream()
                .filter(j -> j.getStatus() == JobStatus.PUBLISHED)
                .toList());
    }

    @Override
    public JobPostingDTO getPublicJob(Long id) {
        return jobPostingRepository.findById(id)
                .filter(j -> j.getStatus() == JobStatus.PUBLISHED)
                .map(mapper::toDto)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offre introuvable ou fermée"));
    }

    @Override
    public ApplicationDTO submitApplication(Long jobId, ApplicationRequest request, MultipartFile cvFile) {
        JobPosting job = jobPostingRepository.findById(jobId)
                .filter(j -> j.getStatus() == JobStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offre introuvable"));

        if (applicationRepository.existsByJobPostingIdAndEmail(jobId, request.getEmail())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Vous avez déjà postulé à cette offre.");
        }

        String storagePath = storeCV(job.getEntrepriseId(), cvFile);

        Application app = Application.builder()
                .entrepriseId(job.getEntrepriseId())
                .jobPosting(job)
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .email(request.getEmail())
                .phone(request.getPhone())
                .linkedinUrl(request.getLinkedinUrl())
                .gdprConsent(request.isGdprConsent())
                .cvStoragePath(storagePath)
                .cvOriginalFilename(cvFile.getOriginalFilename())
                .status(ApplicationStatus.APPLIED)
                .build();

        Application savedApp = applicationRepository.save(app);

        // Email de confirmation de réception (non bloquant)
        try {
            emailService.sendApplicationConfirmation(
                savedApp.getEmail(), savedApp.getFirstName(), 
                job.getTitle(), savedApp.getId());
        } catch (Exception e) {
            log.warn("Email de confirmation non envoyé pour candidature #{}: {}", savedApp.getId(), e.getMessage());
        }

        // Passer immédiatement en AI_ANALYZING et lancer l'évaluation IA enrichie
        savedApp.setStatus(ApplicationStatus.AI_ANALYZING);
        savedApp.setAiStatus("ANALYZING");
        applicationRepository.save(savedApp);

        // Extraire les compétences requises du job (format CSV)
        List<String> competences = job.getRequiredSkills() != null 
                ? Arrays.asList(job.getRequiredSkills().split(",")).stream()
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .toList()
                : List.of();

        // Fire-and-forget : le ai-service fera le callback vers InternalRecruitmentController
        aiService.evaluateCvAsync(
                savedApp.getId(),
                job.getEntrepriseId(),
                savedApp.getCvStoragePath(),
                job.getTitle(),
                job.getDescription(),
                competences,
                job.getMinExperienceYears(),
                job.getExperienceLevel()
        );

        log.info("Candidature #{} créée et évaluation IA lancée pour le poste '{}'", 
                 savedApp.getId(), job.getTitle());

        return mapper.toDto(savedApp);
    }

    @Override
    public void processAiResult(Long applicationId, Map<String, Object> aiResult) {
        Application app = applicationRepository.findById(applicationId)
                .orElseThrow(() -> {
                    log.error("Callback IA : candidature #{} introuvable", applicationId);
                    return new ResponseStatusException(HttpStatus.NOT_FOUND, "Candidature introuvable");
                });

        // Sécurité : vérifier que l'entreprise_id correspond
        Object entrepriseIdObj = aiResult.get("entreprise_id");
        if (entrepriseIdObj != null) {
            Long resultEntrepriseId = Long.valueOf(entrepriseIdObj.toString());
            if (!app.getEntrepriseId().equals(resultEntrepriseId)) {
                log.error("Callback IA : entreprise_id mismatch pour candidature #{}", applicationId);
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Isolation tenant violée");
            }
        }

        try {
            // Extraire les scores
            Map<String, Object> scores = (Map<String, Object>) aiResult.getOrDefault("scores", aiResult);
            
            app.setAiOverallScore(toBigDecimal(scores.get("score_global")));
            app.setAiTechnicalScore(toBigDecimal(scores.get("score_technique")));
            app.setAiExperienceScore(toBigDecimal(scores.get("score_experience")));
            app.setAiCompetenceScore(toBigDecimal(scores.get("score_competences")));
            app.setAiRecommendation((String) aiResult.getOrDefault("recommandation", 
                                     scores.getOrDefault("recommandation", "A_EVALUER")));
            app.setAiRecommendationSummary((String) scores.getOrDefault("resume_evaluation", ""));
            app.setAiNiveauConfiance(toInteger(scores.get("niveau_confiance")));
            app.setAiExperienceDetectee(toInteger(scores.get("annees_experience_detectees")));

            // Stocker les listes JSON en tant que String
            app.setAiPointsForts(toJsonString(scores.get("points_forts")));
            app.setAiPointsFaibles(toJsonString(scores.get("points_faibles")));
            app.setAiCompetencesTrouvees(toJsonString(scores.get("competences_trouvees")));
            app.setAiCompetencesManquantes(toJsonString(scores.get("competences_manquantes")));

            // Stocker le JSON brut complet
            app.setAiAnalysisJson(toJsonString(aiResult));

            // Passer le statut à AI_ANALYZED
            app.setStatus(ApplicationStatus.AI_ANALYZED);
            app.setAiStatus("COMPLETED");

            applicationRepository.save(app);

            log.info("✅ Résultat IA sauvegardé pour candidature #{} — Score: {}, Recommandation: {}",
                     applicationId, app.getAiOverallScore(), app.getAiRecommendation());

            // Push WebSocket temps réel vers les RH connectés
            try {
                NotificationPayload wsPayload = NotificationPayload.of(
                    "RECRUITMENT_AI_RESULT",
                    "Analyse IA terminée",
                    String.format("Candidature #%d analysée — Score: %s/100", 
                                  applicationId, app.getAiOverallScore()),
                    "brain", // icon
                    "violet", // color
                    applicationId, // refId
                    "APPLICATION", // refType
                    "/app/rh/recrutement/offre/" + app.getJobPosting().getId() // actionUrl
                );
                notificationSender.sendToRole("rh", wsPayload);
                log.info("📡 WebSocket push envoyé pour candidature #{}", applicationId);
            } catch (Exception wsEx) {
                log.warn("WebSocket push échoué (non bloquant) : {}", wsEx.getMessage());
            }

        } catch (Exception e) {
            log.error("❌ Erreur lors du traitement du résultat IA pour candidature #{}: {}", 
                      applicationId, e.getMessage());
            app.setAiStatus("FAILED");
            app.setStatus(ApplicationStatus.APPLIED); // Revenir à APPLIED si l'analyse échoue
            applicationRepository.save(app);
        }
    }

    // ── Helpers ──

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) return null;
        try {
            return new BigDecimal(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Integer toInteger(Object value) {
        if (value == null) return null;
        try {
            return Integer.valueOf(value.toString().replaceAll("\\..*", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @Override
    public org.springframework.core.io.Resource getCvFile(Long applicationId, Long entrepriseId) {
        Application app = applicationRepository.findById(applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Candidature introuvable"));

        // Sécurité Tenant : Un RH d'une entreprise A ne peut pas voir le CV d'un candidat de l'entreprise B
        if (!app.getEntrepriseId().equals(entrepriseId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Accès refusé");
        }

        String pathStr = app.getCvStoragePath();
        if (pathStr == null || pathStr.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Fichier CV non associé à cette candidature");
        }

        try {
            Path path = Paths.get(pathStr);
            if (!Files.exists(path)) {
                // Tenter de résoudre le chemin de manière agnostique du répertoire de travail (utile en dev local)
                Path alternative1 = Paths.get("weentime-backend", "services", "rh-service").resolve(pathStr);
                if (Files.exists(alternative1)) {
                    path = alternative1;
                } else {
                    Path alternative2 = Paths.get("services", "rh-service").resolve(pathStr);
                    if (Files.exists(alternative2)) {
                        path = alternative2;
                    } else {
                        Path alternative3 = Paths.get("..").resolve(pathStr);
                        if (Files.exists(alternative3)) {
                            path = alternative3;
                        } else {
                            Path alternative4 = Paths.get("..", "weentime-backend", "services", "rh-service").resolve(pathStr);
                            if (Files.exists(alternative4)) {
                                path = alternative4;
                            }
                        }
                    }
                }
            }

            if (!Files.exists(path)) {
                log.error("❌ Fichier CV introuvable physiquement sur le disque (chemin résolu: {})", path.toAbsolutePath());
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Fichier CV introuvable physiquement");
            }
            return new org.springframework.core.io.UrlResource(path.toUri());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("Erreur lors du chargement du fichier CV : {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur lors du chargement du fichier");
        }
    }

    private String toJsonString(Object value) {
        if (value == null) return null;
        if (value instanceof String) return (String) value;
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(value);
        } catch (Exception e) {
            return value.toString();
        }
    }

    private String storeCV(Long entrepriseId, MultipartFile file) {
        try {
            Path root = Paths.get("uploads", "recrutement", String.valueOf(entrepriseId), "cvs");
            Files.createDirectories(root);
            
            String fileName = UUID.randomUUID() + "_" + file.getOriginalFilename();
            Path target = root.resolve(fileName);
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
            
            return target.toString();
        } catch (IOException e) {
            log.error("Erreur lors du stockage du CV : {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Impossible d'enregistrer le CV.");
        }
    }
}
