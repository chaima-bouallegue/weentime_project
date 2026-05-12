package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.entity.Teletravail;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.TypeDemandeEnum;
import com.weentime.weentimeapp.mapper.TeletravailMapper;
import com.weentime.weentimeapp.repository.TeletravailRepository;
import com.weentime.weentimeapp.repository.ConfigTeletravailRepository;
import com.weentime.weentimeapp.service.TeletravailService;
import com.weentime.weentimeapp.service.AsyncNotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
@SuppressWarnings("null")
public class TeletravailServiceImpl implements TeletravailService {

    private final TeletravailRepository repository;
    private final ConfigTeletravailRepository configRepository;
    private final TeletravailMapper mapper;
    private final OrganisationServiceClient organisationClient;
    private final AsyncNotificationService asyncNotificationService;

    private Long getUserIdByEmail(String email) {
        UtilisateurAuthResponse user = organisationClient.getUtilisateurForAuth(email);
        if (user == null || user.getId() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Utilisateur introuvable");
        }
        return user.getId();
    }

    private TeletravailResponseDTO enrichDto(Teletravail teletravail) {
        return enrichDtoWithUser(teletravail, null);
    }

    private TeletravailResponseDTO enrichDtoWithUser(Teletravail teletravail, UserResponse preloadedUser) {
        TeletravailResponseDTO dto = mapper.toDto(teletravail);
        dto.setUtilisateurId(teletravail.getUtilisateurId());
        try {
            UserResponse user = preloadedUser != null ? preloadedUser : 
                organisationClient.getUtilisateurById(teletravail.getUtilisateurId());
            if (user != null) {
                dto.setEmployeNom(user.getNom());
                dto.setEmployePrenom(user.getPrenom());
                dto.setEmployePoste(user.getPoste() != null ? user.getPoste() : "—");
                dto.setEmployeDepartement(user.getDepartementNom() != null ? user.getDepartementNom() : "—");
            }
        } catch (Exception e) {
            // Log error but continue with partial info
        }
        return dto;
    }

    @Override
    public TeletravailResponseDTO create(TeletravailCreateDTO dto, String userEmail) {
        Long userId = getUserIdByEmail(userEmail);
        UserResponse user = organisationClient.getUtilisateurById(userId);
        
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Utilisateur introuvable");
        }
        
        Long managerId = user.getManagerId();

        if (managerId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucun manager n'est assigné à votre profil. Contactez votre RH.");
        }

        boolean isConflict = repository.existsConflictingTeletravail(
                userId,
                dto.getDateDebut(),
                dto.getDateFin(),
                List.of(StatutDemandeEnum.EN_ATTENTE_MANAGER, StatutDemandeEnum.EN_ATTENTE_RH, StatutDemandeEnum.APPROUVE)
        );

        if (isConflict) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Une demande de télétravail conflictuelle existe déjà pour ces dates.");
        }

        Double nombreJours = 0.0;
        if (dto.getType() != null) {
            switch (dto.getType()) {
                case JOURNEE_COMPLETE -> nombreJours = (double) ChronoUnit.DAYS.between(dto.getDateDebut(), dto.getDateFin()) + 1;
                case DEMI_JOURNEE_MATIN, DEMI_JOURNEE_APRES_MIDI -> nombreJours = 0.5;
                case SEMAINE_COMPLETE -> nombreJours = 5.0;
            }
        }

        Teletravail teletravail = mapper.toEntity(dto);
        teletravail.setUtilisateurId(userId);
        teletravail.setManagerId(managerId);
        teletravail.setEntrepriseId(user.getEntrepriseId());

        teletravail.setStatut(StatutDemandeEnum.EN_ATTENTE_MANAGER);
        teletravail.setTypeDemande(TypeDemandeEnum.TELETRAVAIL);
        teletravail.setEtapeActuelle("MANAGER");
        teletravail.setNombreJours(nombreJours);
        teletravail.setDateCreation(LocalDateTime.now());

        log.info("[TIMING] avant save: {}", System.currentTimeMillis());
        Teletravail saved = repository.save(teletravail);
        log.info("[TIMING] après save: {}", System.currentTimeMillis());
        TeletravailResponseDTO resultDto = enrichDtoWithUser(saved, user);
        log.info("[TIMING] après enrichDto: {}", System.currentTimeMillis());

        // Notification au manager (async — ne bloque pas le thread HTTP)
        asyncNotificationService.sendToUser(managerId, NotificationPayload.of(
            "TELETRAVAIL_SOUMIS",
            "Nouvelle demande de télétravail",
            user.getPrenom() + " " + user.getNom() + " a soumis une demande.",
            "clock", "blue",
            saved.getId(), "TELETRAVAIL", "/app/manager/teletravail-equipe"
        ), user.getEntrepriseId());

        log.info("[TIMING] après sendToUser: {}", System.currentTimeMillis());
        return resultDto;
    }

    @Override
    @Transactional(readOnly = true)
    public TeletravailResponseDTO getById(Long id) {
        return enrichDto(findById(id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeletravailResponseDTO> getMesDemandes(String userEmail) {
        Long userId = getUserIdByEmail(userEmail);
        return repository.findByUtilisateurIdOrderByDateCreationDesc(userId).stream()
                .map(mapper::toDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public QuotaTeletravailDTO getQuota(String userEmail) {
        Long userId = getUserIdByEmail(userEmail);
        return getQuotaByUserId(userId);
    }

    @Override
    @Transactional(readOnly = true)
    public QuotaTeletravailDTO getQuota(Long utilisateurId, String requesterEmail) {
        UserResponse user = organisationClient.getUtilisateurById(utilisateurId);
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Collaborateur introuvable");
        }

        Long requesterId = getUserIdByEmail(requesterEmail);
        UserResponse requester = organisationClient.getUtilisateurById(requesterId);
        boolean sameEnterprise = user.getEntrepriseId().equals(requester.getEntrepriseId());

        if (!sameEnterprise) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Non autorisé à consulter le quota de ce collaborateur");
        }

        return getQuotaByUserId(utilisateurId);
    }

    private QuotaTeletravailDTO getQuotaByUserId(Long userId) {
        LocalDate now = LocalDate.now();
        int month = now.getMonthValue();
        int year = now.getYear();

        Double utilisés = repository.sumNombreJoursByUtilisateurIdAndMonth(
                userId, month, year, List.of(StatutDemandeEnum.APPROUVE));
        if (utilisés == null) utilisés = 0.0;
        
        Double enAttente = repository.sumNombreJoursByUtilisateurIdAndMonth(
                userId, month, year, List.of(StatutDemandeEnum.EN_ATTENTE_MANAGER, StatutDemandeEnum.EN_ATTENTE_RH));
        if (enAttente == null) enAttente = 0.0;

        // Fetch tenant-specific quota
        UserResponse user = organisationClient.getUtilisateurById(userId);
        Integer autorisés = configRepository.findByEntrepriseId(user.getEntrepriseId())
                .map(com.weentime.weentimeapp.entity.ConfigTeletravail::getQuotaMensuel)
                .orElse(4);

        double restants = autorisés - utilisés - enAttente;

        return QuotaTeletravailDTO.builder()
                .joursAutorises(autorisés)
                .joursUtilises(utilisés)
                .joursEnAttente(enAttente)
                .joursRestants(Math.max(0, restants))
                .periodeDebut(now.withDayOfMonth(1))
                .periodeFin(now.with(TemporalAdjusters.lastDayOfMonth()))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeletravailResponseDTO> getDemandesEquipe(String userEmail) {
        Long managerId = getUserIdByEmail(userEmail);
        return repository.findByManagerIdAndStatutOrderByDateCreationDesc(managerId, StatutDemandeEnum.EN_ATTENTE_MANAGER).stream()
                .map(this::enrichDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeletravailResponseDTO> getMesDecisions(String userEmail) {
        Long managerId = getUserIdByEmail(userEmail);
        return repository.findByManagerIdOrderByDateCreationDesc(managerId).stream()
                .map(this::enrichDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public StatsManagerDTO getStatsManager(String userEmail) {
        Long managerId = getUserIdByEmail(userEmail);
        LocalDateTime todayStart = LocalDateTime.now().with(LocalTime.MIN);
        LocalDateTime monthStart = LocalDateTime.now().withDayOfMonth(1).with(LocalTime.MIN);

        return StatsManagerDTO.builder()
                .enAttente(repository.countByManagerIdAndStatut(managerId, StatutDemandeEnum.EN_ATTENTE_MANAGER))
                .valideesAujourdhui(repository.countByManagerIdAndStatutAndDateDecisionAfter(managerId, StatutDemandeEnum.EN_ATTENTE_RH, todayStart))
                .refuseesAujourdhui(repository.countByManagerIdAndStatutAndDateDecisionAfter(managerId, StatutDemandeEnum.REFUSE, todayStart))
                .totalMois(repository.countByManagerIdAndDateCreationAfter(managerId, monthStart))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeletravailResponseDTO> getEnAttenteRh() {
        return repository.findByStatutOrderByDateCreationDesc(StatutDemandeEnum.EN_ATTENTE_RH).stream()
                .map(this::enrichDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeletravailResponseDTO> getHistoriqueGlobal() {
        return repository.findAllByOrderByDateCreationDesc().stream()
                .map(this::enrichDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public StatsRhDTO getStatsRh() {
        LocalDateTime monthStart = LocalDateTime.now().withDayOfMonth(1).with(LocalTime.MIN);
        
        long total = repository.count();
        long approuvees = repository.countByStatut(StatutDemandeEnum.APPROUVE);
        
        List<Teletravail> allApprouvees = repository.findByStatutOrderByDateCreationDesc(StatutDemandeEnum.APPROUVE);
        double totalJours = allApprouvees.stream().mapToDouble(t -> t.getNombreJours() != null ? t.getNombreJours() : 0.0).sum();

        double taux = total == 0 ? 0.0 : (approuvees * 100.0) / total;
        double moyenne = approuvees == 0 ? 0.0 : totalJours / approuvees;

        return StatsRhDTO.builder()
                .enAttente(repository.countByStatut(StatutDemandeEnum.EN_ATTENTE_RH))
                .approuveCeMois(repository.countByStatutAndDateDecisionAfter(StatutDemandeEnum.APPROUVE, monthStart))
                .refuseCeMois(repository.countByStatutAndDateDecisionAfter(StatutDemandeEnum.REFUSE, monthStart))
                .tauxApprobation(taux)
                .moyenneJoursParDemande(moyenne)
                .totalDemandes(total)
                .build();
    }

    private Teletravail findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de télétravail introuvable"));
    }

    @Override
    public TeletravailResponseDTO annuler(Long id, String userEmail) {
        Teletravail teletravail = findById(id);
        Long userId = getUserIdByEmail(userEmail);

        if (!teletravail.getUtilisateurId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Non autorisé à annuler cette demande");
        }

        if (teletravail.getStatut() != StatutDemandeEnum.EN_ATTENTE_MANAGER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Impossible d'annuler une demande qui n'est plus chez le manager.");
        }

        teletravail.setStatut(StatutDemandeEnum.ANNULE);
        teletravail.setEtapeActuelle("TERMINE");
        teletravail.setDateDecision(LocalDateTime.now());
        return mapper.toDto(repository.save(teletravail));
    }

    @Override
    public TeletravailResponseDTO validerManager(Long id, Long managerId, String commentaire) {
        log.info("[PERF] Début validerManager id={}", id);
        long start = System.currentTimeMillis();
        
        Teletravail teletravail = findById(id);
        if (teletravail.getStatut() != StatutDemandeEnum.EN_ATTENTE_MANAGER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Statut invalide pour la validation manager");
        }

        teletravail.setStatut(StatutDemandeEnum.EN_ATTENTE_RH);
        teletravail.setEtapeActuelle("RH");
        teletravail.setCommentaireManager(commentaire);
        teletravail.setManagerId(managerId);
        teletravail.setDateDecision(LocalDateTime.now());
        
        Teletravail saved = repository.save(teletravail);
        log.info("[PERF] Repository save took {}ms", System.currentTimeMillis() - start);

        // Notification au RH
        asyncNotificationService.sendToRole("ROLE_RH", NotificationPayload.of(
            "TELETRAVAIL_VALIDATION_RH",
            "Télétravail en attente RH",
            "Une demande validée par manager attend votre décision.",
            "check-circle", "purple",
            saved.getId(), "TELETRAVAIL", "/app/rh/teletravail"
        ), teletravail.getEntrepriseId());

        long mid = System.currentTimeMillis();
        TeletravailResponseDTO result = enrichDto(saved);
        log.info("[PERF] enrichDto took {}ms", System.currentTimeMillis() - mid);
        log.info("[PERF] Total validerManager took {}ms", System.currentTimeMillis() - start);
        
        return result;
    }

    @Override
    public TeletravailResponseDTO rejeterManager(Long id, Long managerId, String commentaire) {
        Teletravail teletravail = findById(id);
        if (teletravail.getStatut() != StatutDemandeEnum.EN_ATTENTE_MANAGER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Statut invalide pour le rejet manager");
        }

        teletravail.setStatut(StatutDemandeEnum.REFUSE);
        teletravail.setEtapeActuelle("TERMINE");
        teletravail.setCommentaireManager(commentaire);
        teletravail.setManagerId(managerId);
        teletravail.setDateDecision(LocalDateTime.now());
        Teletravail saved = repository.save(teletravail);

        // Notification à l'employé (async)
        asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
            "TELETRAVAIL_REFUSE",
            "Télétravail Refusé",
            "Votre manager a refusé votre demande de télétravail.",
            "user-x", "red",
            saved.getId(), "TELETRAVAIL", "/app/employee/teletravail"
        ), teletravail.getEntrepriseId());

        return enrichDto(saved);
    }

    @Override
    public TeletravailResponseDTO validerRH(Long id, String commentaire) {
        log.info("[PERF] Début validerRH id={}", id);
        long start = System.currentTimeMillis();
        
        Teletravail teletravail = findById(id);
        if (teletravail.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Statut invalide pour la validation RH");
        }

        teletravail.setStatut(StatutDemandeEnum.APPROUVE);
        teletravail.setEtapeActuelle("TERMINE");
        teletravail.setCommentaireRH(commentaire);
        teletravail.setDateDecision(LocalDateTime.now());
        
        Teletravail saved = repository.save(teletravail);
        log.info("[PERF] Repository save took {}ms", System.currentTimeMillis() - start);

        // Notification à l'employé
        asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
            "TELETRAVAIL_APPROUVE",
            "Télétravail Approuvé",
            "Votre demande de télétravail a été approuvée par le RH.",
            "check-circle", "green",
            saved.getId(), "TELETRAVAIL", "/app/employee/teletravail"
        ), teletravail.getEntrepriseId());

        long mid = System.currentTimeMillis();
        TeletravailResponseDTO result = enrichDto(saved);
        log.info("[PERF] enrichDto took {}ms", System.currentTimeMillis() - mid);
        log.info("[PERF] Total validerRH took {}ms", System.currentTimeMillis() - start);
        
        return result;
    }

    @Override
    public TeletravailResponseDTO rejeterRH(Long id, String commentaire) {
        Teletravail teletravail = findById(id);
        if (teletravail.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Statut invalide pour le rejet RH");
        }

        teletravail.setStatut(StatutDemandeEnum.REFUSE);
        teletravail.setEtapeActuelle("TERMINE");
        teletravail.setCommentaireRH(commentaire);
        teletravail.setDateDecision(LocalDateTime.now());
        Teletravail saved = repository.save(teletravail);

        // Notification à l'employé (async)
        asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
            "TELETRAVAIL_REFUSE",
            "Télétravail Refusé",
            "Votre demande de télétravail a été refusée par le RH.",
            "user-x", "red",
            saved.getId(), "TELETRAVAIL", "/app/employee/teletravail"
        ), teletravail.getEntrepriseId());

        return enrichDto(saved);
    }
}
