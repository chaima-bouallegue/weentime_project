package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.CongeDTO;
import com.weentime.weentimeapp.dto.NotificationPayload;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.entity.Conge;
import com.weentime.weentimeapp.entity.SoldeConge;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.mapper.CongeMapper;
import com.weentime.weentimeapp.repository.CongeRepository;
import com.weentime.weentimeapp.repository.SoldeCongeRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.AsyncNotificationService;
import com.weentime.weentimeapp.service.CongeService;
import com.weentime.weentimeapp.service.UserCacheService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
@SuppressWarnings("null")
public class CongeServiceImpl implements CongeService {

    private final CongeRepository congeRepository;
    private final SoldeCongeRepository soldeCongeRepository;
    private final TypeCongeRepository typeCongeRepository;
    private final CongeMapper congeMapper;
    private final OrganisationServiceClient organisationServiceClient;
    private final AsyncNotificationService asyncNotificationService;
    private final UserCacheService userCacheService;

    @Override
    public CongeDTO create(CongeDTO dto) {
        Long userId = SecurityUtils.getCurrentUserId();
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Utilisateur courant introuvable.");
        }
        Long entrepriseId = requireEntrepriseId();
        validateCreatePayload(dto);

        int nombreJours = calculateBusinessDays(dto.getDateDebut(), dto.getDateFin());
        if (nombreJours <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La periode selectionnee ne contient aucun jour ouvre.");
        }

        if (congeRepository.existsOverlappingConge(userId, dto.getDateDebut(), dto.getDateFin())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Une demande de conge existe deja sur cette periode.");
        }

        TypeConge typeConge = findAccessibleTypeConge(dto.getTypeCongeId(), entrepriseId);
        if (Boolean.TRUE.equals(typeConge.getRequireJustificatif()) && !Boolean.TRUE.equals(dto.getJustificatifFourni())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Un justificatif est obligatoire pour ce type de conge.");
        }

        SoldeConge solde = null;
        if (Boolean.TRUE.equals(typeConge.getDecompteJours())) {
            solde = findOrCreateSolde(userId, entrepriseId, dto.getTypeCongeId(), dto.getDateDebut().getYear(), typeConge);
            if (availableDays(solde) < nombreJours) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Solde insuffisant.");
            }
        }

        UserResponse user = resolveUser(userId);
        Long managerId = user != null ? user.getManagerId() : null;
        boolean isRh = hasCurrentRole("ROLE_RH");

        Conge conge = congeMapper.toEntity(dto);
        conge.setUtilisateurId(userId);
        conge.setEntrepriseId(entrepriseId);
        conge.setNombreJours(nombreJours);
        conge.setManagerId(managerId);
        conge.setDateCreation(LocalDateTime.now());

        if (isRh) {
            conge.setStatut(StatutDemandeEnum.APPROUVE);
            conge.setCommentaireValidateur("Auto-approuvee - demande RH");
            conge.setDateDecision(LocalDateTime.now());
            if (solde != null) {
                consumeBalance(solde, nombreJours, false);
            }
        } else {
            conge.setStatut(managerId == null ? StatutDemandeEnum.EN_ATTENTE_RH : StatutDemandeEnum.EN_ATTENTE_MANAGER);
            if (solde != null) {
                solde.setJoursEnAttente(safe(solde.getJoursEnAttente()) + nombreJours);
                soldeCongeRepository.save(solde);
            }
        }

        Conge savedConge = congeRepository.save(conge);
        CongeDTO savedDto = congeMapper.toDto(savedConge);

        sendCreateNotification(userId, managerId, user, savedDto, entrepriseId, isRh);
        return savedDto;
    }

    @Override
    public CongeDTO validateByManager(Long id, Long managerId) {
        Conge conge = congeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        if (conge.getStatut() != StatutDemandeEnum.EN_ATTENTE_MANAGER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cette demande n'est pas en attente manager.");
        }

        conge.setStatut(StatutDemandeEnum.EN_ATTENTE_RH);
        conge.setManagerId(managerId);
        conge.setDateDecision(LocalDateTime.now());
        Conge saved = congeRepository.save(conge);

        try {
            asyncNotificationService.sendToRole("ROLE_RH", NotificationPayload.of(
                    "CONGE_VALIDATION_RH",
                    "Conge en attente RH",
                    "Une demande attend votre decision.",
                    "check-circle", "purple",
                    saved.getId(), "CONGE", "/app/rh/conges"
            ), conge.getEntrepriseId());
        } catch (Exception exception) {
            log.warn("Failed to send RH validation notification: {}", exception.getMessage());
        }

        return congeMapper.toDto(saved);
    }

    @Override
    public CongeDTO validateByRH(Long id, Long rhId) {
        Conge conge = congeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        if (conge.getStatut() != StatutDemandeEnum.EN_ATTENTE_RH) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cette demande n'est pas en attente RH.");
        }

        TypeConge typeConge = typeCongeRepository.findById(conge.getTypeCongeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de conge introuvable"));

        if (Boolean.TRUE.equals(typeConge.getDecompteJours())) {
            SoldeConge solde = soldeCongeRepository.findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(
                    conge.getUtilisateurId(), conge.getTypeCongeId(), conge.getDateDebut().getYear()
            ).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Solde de conge introuvable."));
            consumeBalance(solde, conge.getNombreJours(), true);
        }

        conge.setStatut(StatutDemandeEnum.APPROUVE);
        conge.setDateDecision(LocalDateTime.now());
        Conge saved = congeRepository.save(conge);

        try {
            asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
                    "CONGE_APPROUVE",
                    "Conge approuve",
                    "Votre demande a ete acceptee.",
                    "check-circle", "green",
                    saved.getId(), "CONGE", "/app/employee/conges"
            ), conge.getEntrepriseId());
        } catch (Exception exception) {
            log.warn("Failed to send leave approval notification: {}", exception.getMessage());
        }

        return congeMapper.toDto(saved);
    }

    @Override
    public CongeDTO reject(Long id, Long validatorId, String commentaire) {
        Conge conge = congeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        if (conge.getStatut() == StatutDemandeEnum.APPROUVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Une demande deja approuvee ne peut pas etre refusee.");
        }
        if (conge.getStatut() == StatutDemandeEnum.REFUSE || conge.getStatut() == StatutDemandeEnum.ANNULE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cette demande est deja finalisee.");
        }

        TypeConge typeConge = typeCongeRepository.findById(conge.getTypeCongeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de conge introuvable"));
        releasePendingBalance(conge, typeConge);

        conge.setStatut(StatutDemandeEnum.REFUSE);
        conge.setCommentaireValidateur(commentaire);
        conge.setDateDecision(LocalDateTime.now());
        Conge saved = congeRepository.save(conge);

        try {
            asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
                    "CONGE_REFUSE",
                    "Conge refuse",
                    "Votre demande a ete refusee.",
                    "user-x", "red",
                    saved.getId(), "CONGE", "/app/employee/conges"
            ), conge.getEntrepriseId());
        } catch (Exception exception) {
            log.warn("Failed to send leave rejection notification: {}", exception.getMessage());
        }

        return congeMapper.toDto(saved);
    }

    @Override
    public CongeDTO cancel(Long id) {
        Conge conge = congeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        Long currentUserId = SecurityUtils.getCurrentUserId();
        if (currentUserId != null && !Objects.equals(currentUserId, conge.getUtilisateurId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Vous ne pouvez annuler que vos propres demandes.");
        }
        if (conge.getStatut() == StatutDemandeEnum.APPROUVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Une demande deja approuvee ne peut pas etre annulee.");
        }

        TypeConge typeConge = typeCongeRepository.findById(conge.getTypeCongeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de conge introuvable"));
        releasePendingBalance(conge, typeConge);

        conge.setStatut(StatutDemandeEnum.ANNULE);
        conge.setDateDecision(LocalDateTime.now());
        return congeMapper.toDto(congeRepository.save(conge));
    }

    @Override
    @Transactional(readOnly = true)
    public CongeDTO getById(Long id) {
        CongeDTO dto = congeRepository.findById(id)
                .map(congeMapper::toDto)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        enrichDto(dto);
        return dto;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CongeDTO> getByUtilisateur(Long utilisateurId) {
        List<CongeDTO> dtos = congeMapper.toDtoList(congeRepository.findByUtilisateurId(utilisateurId));
        dtos.forEach(this::enrichDto);
        return dtos;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CongeDTO> getByUtilisateurs(List<Long> utilisateurIds) {
        List<CongeDTO> dtos = congeMapper.toDtoList(congeRepository.findByUtilisateurIdInOrderByDateCreationDesc(utilisateurIds));
        dtos.forEach(this::enrichDto);
        return dtos;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CongeDTO> getAll() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        List<Conge> conges = entrepriseId == null
                ? congeRepository.findAll()
                : congeRepository.findByEntrepriseIdOrderByDateCreationDesc(entrepriseId);
        List<CongeDTO> dtos = congeMapper.toDtoList(conges);
        dtos.forEach(this::enrichDto);
        return dtos;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CongeDTO> getPendingForEntreprise(Long entrepriseId) {
        if (entrepriseId == null) {
            return List.of();
        }
        List<CongeDTO> dtos = congeMapper.toDtoList(
                congeRepository.findByEntrepriseIdAndStatutOrderByDateCreationDesc(entrepriseId, StatutDemandeEnum.EN_ATTENTE_RH)
        );
        dtos.forEach(this::enrichDto);
        return dtos;
    }

    private void validateCreatePayload(CongeDTO dto) {
        if (dto == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La demande de conge est obligatoire.");
        }
        if (dto.getTypeCongeId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le type de conge est obligatoire.");
        }
        if (dto.getDateDebut() == null || dto.getDateFin() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Les dates de debut et de fin sont obligatoires.");
        }
        if (dto.getDateFin().isBefore(dto.getDateDebut())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La date de fin doit etre apres la date de debut.");
        }
    }

    private Long requireEntrepriseId() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune entreprise associee a ce compte.");
        }
        return entrepriseId;
    }

    private TypeConge findAccessibleTypeConge(Long typeCongeId, Long entrepriseId) {
        return typeCongeRepository.findById(typeCongeId)
                .filter(type -> type.getEntrepriseId() == null || Objects.equals(type.getEntrepriseId(), entrepriseId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de conge non trouve"));
    }

    private SoldeConge findOrCreateSolde(
            Long userId,
            Long entrepriseId,
            Long typeCongeId,
            int annee,
            TypeConge typeConge
    ) {
        return soldeCongeRepository.findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(userId, typeCongeId, annee)
                .orElseGet(() -> {
                    double initialBalance = typeConge.getNombreJoursMax() != null
                            ? typeConge.getNombreJoursMax().doubleValue()
                            : 25.0;
                    SoldeConge newSolde = SoldeConge.builder()
                            .utilisateurId(userId)
                            .entrepriseId(entrepriseId)
                            .typeCongeId(typeCongeId)
                            .annee(annee)
                            .joursAcquis(initialBalance)
                            .joursUtilises(0.0)
                            .joursRestants(initialBalance)
                            .joursEnAttente(0.0)
                            .build();
                    return soldeCongeRepository.save(newSolde);
                });
    }

    private void consumeBalance(SoldeConge solde, Integer nombreJours, boolean releasePending) {
        int days = nombreJours == null ? 0 : nombreJours;
        if (safe(solde.getJoursRestants()) < days) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Solde insuffisant.");
        }
        solde.setJoursRestants(safe(solde.getJoursRestants()) - days);
        solde.setJoursUtilises(safe(solde.getJoursUtilises()) + days);
        if (releasePending) {
            solde.setJoursEnAttente(Math.max(0.0, safe(solde.getJoursEnAttente()) - days));
        }
        soldeCongeRepository.save(solde);
    }

    private void releasePendingBalance(Conge conge, TypeConge typeConge) {
        if (!Boolean.TRUE.equals(typeConge.getDecompteJours()) || !isPending(conge.getStatut())) {
            return;
        }
        soldeCongeRepository.findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(
                conge.getUtilisateurId(), conge.getTypeCongeId(), conge.getDateDebut().getYear()
        ).ifPresent(solde -> {
            solde.setJoursEnAttente(Math.max(0.0, safe(solde.getJoursEnAttente()) - safe(conge.getNombreJours())));
            soldeCongeRepository.save(solde);
        });
    }

    private boolean isPending(StatutDemandeEnum statut) {
        return statut == StatutDemandeEnum.EN_ATTENTE_MANAGER || statut == StatutDemandeEnum.EN_ATTENTE_RH;
    }

    private double availableDays(SoldeConge solde) {
        return Math.max(0.0, safe(solde.getJoursRestants()) - safe(solde.getJoursEnAttente()));
    }

    private double safe(Double value) {
        return value == null ? 0.0 : value;
    }

    private double safe(Integer value) {
        return value == null ? 0.0 : value.doubleValue();
    }

    private boolean hasCurrentRole(String role) {
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getAuthorities().stream().anyMatch(authority -> role.equals(authority.getAuthority()));
    }

    private UserResponse resolveUser(Long userId) {
        try {
            return organisationServiceClient.getUtilisateurById(userId);
        } catch (Exception e) {
            log.warn("Failed to resolve user manager: {}", e.getMessage());
            return null;
        }
    }

    private void sendCreateNotification(
            Long userId,
            Long managerId,
            UserResponse user,
            CongeDTO savedDto,
            Long entrepriseId,
            boolean isRh
    ) {
        try {
            if (isRh) {
                asyncNotificationService.sendToUser(userId, NotificationPayload.of(
                        "CONGE_APPROUVE",
                        "Conge auto-approuve",
                        "Votre demande de conge RH a ete auto-approuvee.",
                        "check-circle", "green",
                        savedDto.getId(), "CONGE", "/app/employee/conges"
                ), entrepriseId);
                return;
            }

            if (managerId != null && user != null) {
                asyncNotificationService.sendToUser(managerId, NotificationPayload.of(
                        "CONGE_SOUMIS",
                        "Nouvelle demande de conge",
                        user.getPrenom() + " " + user.getNom() + " a soumis une demande.",
                        "clock", "blue",
                        savedDto.getId(), "CONGE", "/app/manager/approbations"
                ), entrepriseId);
                return;
            }

            asyncNotificationService.sendToRole("ROLE_RH", NotificationPayload.of(
                    "CONGE_VALIDATION_RH",
                    "Conge en attente RH",
                    "Une demande attend votre decision.",
                    "check-circle", "purple",
                    savedDto.getId(), "CONGE", "/app/rh/conges"
            ), entrepriseId);
        } catch (Exception e) {
            log.warn("Failed to send leave notification: {}", e.getMessage());
        }
    }

    private int calculateBusinessDays(LocalDate start, LocalDate end) {
        int count = 0;
        LocalDate current = start;
        while (!current.isAfter(end)) {
            if (current.getDayOfWeek() != DayOfWeek.SATURDAY && current.getDayOfWeek() != DayOfWeek.SUNDAY) {
                count++;
            }
            current = current.plusDays(1);
        }
        return count;
    }

    private void enrichDto(CongeDTO dto) {
        UserResponse user = userCacheService.getOrLoad(dto.getUtilisateurId(), id -> {
            try {
                return organisationServiceClient.getUtilisateurById(id);
            } catch (Exception e) {
                log.warn("Impossible de récupérer l'utilisateur {}", id);
                return null;
            }
        });
        if (user != null) {
            dto.setUserName(user.getPrenom() + " " + user.getNom());
            dto.setUserEmail(user.getEmail());
        }

        UserResponse manager = userCacheService.getOrLoad(dto.getManagerId(), id -> {
            try {
                return organisationServiceClient.getUtilisateurById(id);
            } catch (Exception e) {
                log.warn("Impossible de récupérer le manager {}", id);
                return null;
            }
        });
        if (manager != null) {
            dto.setManagerName(manager.getPrenom() + " " + manager.getNom());
        }

        if (dto.getTypeCongeId() != null) {
            try {
                typeCongeRepository.findById(dto.getTypeCongeId())
                        .map(TypeConge::getLibelle)
                        .ifPresent(dto::setTypeCongeNom);
            } catch (Exception e) {
                log.warn("Impossible de récupérer le type de congé {}", dto.getTypeCongeId());
            }
        }
    }
}
