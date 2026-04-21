package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.AutorisationDTO;
import com.weentime.weentimeapp.dto.NotificationPayload;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.dto.StatsAutorisationDTO;
import com.weentime.weentimeapp.dto.UtilisateurAuthResponse;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.entity.Autorisation;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.mapper.AutorisationMapper;
import com.weentime.weentimeapp.entity.TypeAutorisation;
import com.weentime.weentimeapp.repository.AutorisationRepository;
import com.weentime.weentimeapp.repository.TypeAutorisationRepository;
import com.weentime.weentimeapp.service.AsyncNotificationService;
import com.weentime.weentimeapp.service.AutorisationService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
@SuppressWarnings("null")
public class AutorisationServiceImpl implements AutorisationService {

    private final AutorisationRepository repository;
    private final TypeAutorisationRepository typeRepository;
    private final AutorisationMapper mapper;
    private final OrganisationServiceClient organisationClient;
    private final AsyncNotificationService asyncNotificationService;

    private static final int THRESHOLD_MINUTES = 120;

    @Override
    public AutorisationDTO create(AutorisationDTO dto, String userEmail) {
        UtilisateurAuthResponse user = organisationClient.getUtilisateurForAuth(userEmail);
        if (user == null) throw new RuntimeException("Utilisateur non trouvé: " + userEmail);

        Autorisation entity = mapper.toEntity(dto);

        // --- Resolve TypeAutorisation ---
        if (dto.getTypeAutorisation() != null) {
            TypeAutorisation type = null;
            if (dto.getTypeAutorisation().getId() != null) {
                type = typeRepository.findById(dto.getTypeAutorisation().getId())
                        .orElse(null);
            } else if (dto.getTypeAutorisation().getLibelle() != null) {
                type = typeRepository.findByLibelle(dto.getTypeAutorisation().getLibelle())
                        .orElse(null);
            }

            if (type == null) {
                throw new EntityNotFoundException("Type d'autorisation non trouvé: " +
                        (dto.getTypeAutorisation().getId() != null ? dto.getTypeAutorisation().getId() : dto.getTypeAutorisation().getLibelle()));
            }
            entity.setTypeAutorisation(type);
        }
        
        // --- Calculate Duration if missing ---
        if ((entity.getDuree() == null || entity.getDuree() == 0) 
            && entity.getHeureDebut() != null && entity.getHeureFin() != null) {
            long minutes = Duration.between(entity.getHeureDebut(), entity.getHeureFin()).toMinutes();
            entity.setDuree((int) minutes);
        }

        entity.setUtilisateurId(user.getId());
        entity.setEntrepriseId(user.getEntrepriseId());
        entity.setManagerId(user.getManagerId());
        entity.setStatut(StatutDemandeEnum.EN_ATTENTE_MANAGER);
        entity.setDateCreation(LocalDateTime.now());

        Autorisation saved = repository.save(entity);
        AutorisationDTO result = enrichWithUserName(mapper.toDto(saved));

        // Notification au Manager (ou RH si pas de manager)
        if (user.getManagerId() != null) {
            asyncNotificationService.sendToUser(user.getManagerId(), NotificationPayload.of(
                "AUTORISATION_SOUMISE",
                "Nouvelle demande d'autorisation",
                user.getPrenom() + " " + user.getNom() + " a soumis une demande d'autorisation.",
                "clock", "blue",
                saved.getId(), "AUTORISATION", "/app/manager/approbations"
            ), user.getEntrepriseId());
        } else {
            asyncNotificationService.sendToRole("ROLE_RH", NotificationPayload.of(
                "AUTORISATION_SOUMISE",
                "Nouvelle demande d'autorisation",
                user.getPrenom() + " " + user.getNom() + " a soumis une demande d'autorisation.",
                "clock", "blue",
                saved.getId(), "AUTORISATION", "/app/rh/autorisations"
            ), user.getEntrepriseId());
        }

        return result;
    }

    @Override
    public AutorisationDTO validateManager(Long id, String managerEmail) {
        UtilisateurAuthResponse manager = organisationClient.getUtilisateurForAuth(managerEmail);
        if (manager == null) throw new RuntimeException("Manager non trouvé: " + managerEmail);

        Autorisation entity = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Autorisation non trouvée"));

        if (entity.getDuree() != null && entity.getDuree() <= THRESHOLD_MINUTES) {
            entity.setStatut(StatutDemandeEnum.APPROUVE);
        } else {
            entity.setStatut(StatutDemandeEnum.EN_ATTENTE_RH);
        }

        entity.setManagerId(manager.getId());
        entity.setDateDecision(LocalDateTime.now());
        Autorisation saved = repository.save(entity);
        AutorisationDTO result = enrichWithUserName(mapper.toDto(saved));

        if (entity.getStatut() == StatutDemandeEnum.APPROUVE) {
            // Durée ≤ seuil → Manager valide seul → notifier l'employé
            asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
                "AUTORISATION_APPROUVEE",
                "Autorisation approuvée",
                "Votre demande d'autorisation a été approuvée par votre manager.",
                "check-circle", "green",
                saved.getId(), "AUTORISATION", "/app/employee/autorisations"
            ), entity.getEntrepriseId());
        } else {
            // Durée > seuil → RH doit valider
            asyncNotificationService.sendToRole("ROLE_RH", NotificationPayload.of(
                "AUTORISATION_VALIDATION_RH",
                "Autorisation en attente RH",
                "Une demande d'autorisation attend votre décision.",
                "check-circle", "purple",
                saved.getId(), "AUTORISATION", "/app/rh/autorisations"
            ), entity.getEntrepriseId());
        }

        return result;
    }

    @Override
    public AutorisationDTO validateRH(Long id, String rhEmail) {
        UtilisateurAuthResponse rhUser = organisationClient.getUtilisateurForAuth(rhEmail);
        if (rhUser == null) throw new RuntimeException("RH non trouvé: " + rhEmail);

        Autorisation entity = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Autorisation non trouvée"));

        if (entity.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new IllegalStateException("Seules les demandes en attente RH peuvent être validées par les RH");
        }

        entity.setStatut(StatutDemandeEnum.APPROUVE);
        entity.setDateDecision(LocalDateTime.now());
        Autorisation saved = repository.save(entity);
        AutorisationDTO result = enrichWithUserName(mapper.toDto(saved));

        // RH approuve → notifier l'employé
        asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
            "AUTORISATION_APPROUVEE",
            "Autorisation approuvée",
            "Votre demande d'autorisation a été approuvée par le RH.",
            "check-circle", "green",
            saved.getId(), "AUTORISATION", "/app/employee/autorisations"
        ), entity.getEntrepriseId());

        return result;
    }

    @Override
    public AutorisationDTO reject(Long id, String validatorEmail, String commentaire) {
        UtilisateurAuthResponse validator = organisationClient.getUtilisateurForAuth(validatorEmail);
        if (validator == null) throw new RuntimeException("Validateur non trouvé: " + validatorEmail);

        Autorisation entity = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Autorisation non trouvée"));

        entity.setStatut(StatutDemandeEnum.REFUSE);
        entity.setCommentaireValidateur(commentaire);
        entity.setDateDecision(LocalDateTime.now());
        Autorisation saved = repository.save(entity);
        AutorisationDTO result = enrichWithUserName(mapper.toDto(saved));

        // Refus à toute étape → notifier l'employé
        asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
            "AUTORISATION_REFUSEE",
            "Autorisation refusée",
            "Votre demande d'autorisation a été refusée.",
            "x-circle", "red",
            saved.getId(), "AUTORISATION", "/app/employee/autorisations"
        ), entity.getEntrepriseId());

        return result;
    }

    @Override
    public AutorisationDTO cancel(Long id, String userEmail) {
        UtilisateurAuthResponse user = organisationClient.getUtilisateurForAuth(userEmail);
        if (user == null) {
            throw new RuntimeException("Utilisateur non trouvé: " + userEmail);
        }

        Autorisation entity = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Autorisation non trouvée"));

        if (!user.getId().equals(entity.getUtilisateurId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Vous n'etes pas autorise a annuler cette autorisation.");
        }

        if (entity.getStatut() != StatutDemandeEnum.EN_ATTENTE_MANAGER
                && entity.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Seules les demandes en attente peuvent etre annulees.");
        }

        entity.setStatut(StatutDemandeEnum.ANNULE);
        entity.setDateDecision(LocalDateTime.now());
        entity.setCommentaireValidateur("Annulee par l'employe");
        Autorisation saved = repository.save(entity);
        return enrichWithUserName(mapper.toDto(saved));
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AutorisationDTO> getEmployeeHistory(String email, int page, int size) {
        UtilisateurAuthResponse user = organisationClient.getUtilisateurForAuth(email);
        Page<Autorisation> resultPage = repository.findByUtilisateurId(user.getId(), 
                PageRequest.of(page, size, Sort.by("dateCreation").descending()));
        
        PageResponse<AutorisationDTO> response = PageResponse.fromPage(resultPage, mapper::toDto);
        enrichListWithUserNames(response.getContent());
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AutorisationDTO> getManagerHistory(String email, int page, int size) {
        UtilisateurAuthResponse manager = organisationClient.getUtilisateurForAuth(email);
        Page<Autorisation> resultPage = repository.findByManagerId(manager.getId(), 
                PageRequest.of(page, size, Sort.by("dateCreation").descending()));
        
        PageResponse<AutorisationDTO> response = PageResponse.fromPage(resultPage, mapper::toDto);
        enrichListWithUserNames(response.getContent());
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AutorisationDTO> getRhHistory(String email, int page, int size) {
        UtilisateurAuthResponse rh = organisationClient.getUtilisateurForAuth(email);
        Page<Autorisation> resultPage = repository.findByEntrepriseId(rh.getEntrepriseId(), 
                PageRequest.of(page, size, Sort.by("dateCreation").descending()));
        
        PageResponse<AutorisationDTO> response = PageResponse.fromPage(resultPage, mapper::toDto);
        enrichListWithUserNames(response.getContent());
        return response;
    }

    // --- Enrichment Helpers ---

    private AutorisationDTO enrichWithUserName(AutorisationDTO dto) {
        if (dto.getUtilisateurId() != null) {
            UserResponse user = organisationClient.getUtilisateurById(dto.getUtilisateurId());
            if (user != null) {
                dto.setNomComplet(user.getPrenom() + " " + user.getNom());
            }
        }
        return dto;
    }

    private void enrichListWithUserNames(List<AutorisationDTO> list) {
        Map<Long, String> cache = new HashMap<>(); // Local cache for this call
        for (AutorisationDTO dto : list) {
            Long uid = dto.getUtilisateurId();
            if (uid != null) {
                if (!cache.containsKey(uid)) {
                    UserResponse user = organisationClient.getUtilisateurById(uid);
                    if (user != null) {
                        cache.put(uid, user.getPrenom() + " " + user.getNom());
                    } else {
                        cache.put(uid, "Inconnu");
                    }
                }
                dto.setNomComplet(cache.get(uid));
            }
        }
    }

    @Override
    @Transactional(readOnly = true)
    public StatsAutorisationDTO getEmployeeKPIs(String email) {
        UtilisateurAuthResponse user = organisationClient.getUtilisateurForAuth(email);
        Long uid = user.getId();
        return StatsAutorisationDTO.builder()
                .total(repository.countByUtilisateurId(uid))
                .enAttente(repository.countByUtilisateurIdAndStatut(uid, StatutDemandeEnum.EN_ATTENTE_MANAGER) + 
                          repository.countByUtilisateurIdAndStatut(uid, StatutDemandeEnum.EN_ATTENTE_RH))
                .approuvees(repository.countByUtilisateurIdAndStatut(uid, StatutDemandeEnum.APPROUVE))
                .seuil(repository.countByUtilisateurIdAndDureeGreaterThan(uid, THRESHOLD_MINUTES))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public StatsAutorisationDTO getManagerKPIs(String email) {
        UtilisateurAuthResponse manager = organisationClient.getUtilisateurForAuth(email);
        Long mid = manager.getId();
        return StatsAutorisationDTO.builder()
                .total(repository.countByManagerIdAndStatut(mid, StatutDemandeEnum.EN_ATTENTE_MANAGER))
                .enAttente(repository.countByManagerIdAndStatut(mid, StatutDemandeEnum.EN_ATTENTE_MANAGER))
                .approuvees(0)
                .seuil(0)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public StatsAutorisationDTO getRhKPIs(String email) {
        UtilisateurAuthResponse rh = organisationClient.getUtilisateurForAuth(email);
        Long eid = rh.getEntrepriseId();
        return StatsAutorisationDTO.builder()
                .total(repository.countByEntrepriseId(eid))
                .enAttente(repository.countByEntrepriseIdAndStatut(eid, StatutDemandeEnum.EN_ATTENTE_RH))
                .approuvees(repository.countByEntrepriseIdAndStatut(eid, StatutDemandeEnum.APPROUVE))
                .seuil(0)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public AutorisationDTO getById(Long id) {
        return repository.findById(id)
                .map(mapper::toDto)
                .map(this::enrichWithUserName)
                .orElseThrow(() -> new EntityNotFoundException("Autorisation not found"));
    }

    @Override
    public List<AutorisationDTO> getAll() {
        List<AutorisationDTO> list = mapper.toDtoList(repository.findAll());
        enrichListWithUserNames(list);
        return list;
    }
}
