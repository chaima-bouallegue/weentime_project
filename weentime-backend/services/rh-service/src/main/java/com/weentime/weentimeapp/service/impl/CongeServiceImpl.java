package com.weentime.weentimeapp.service.impl;

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
import com.weentime.weentimeapp.service.CongeService;
import com.weentime.weentimeapp.service.AsyncNotificationService;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.client.OrganisationServiceClient;
import jakarta.persistence.EntityNotFoundException;
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

    @Override
    public CongeDTO create(CongeDTO dto) {
        Long userId = SecurityUtils.getCurrentUserId();
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        int annee = dto.getDateDebut().getYear();

        int nombreJours = calculateBusinessDays(dto.getDateDebut(), dto.getDateFin());
        if (nombreJours <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La période sélectionnée ne contient aucun jour ouvré.");
        }

        if (congeRepository.existsOverlappingConge(userId, dto.getDateDebut(), dto.getDateFin())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Une demande de congé existe déjà sur cette période.");
        }

        TypeConge typeConge = typeCongeRepository.findById(dto.getTypeCongeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de congé non trouvé"));

        if (Boolean.TRUE.equals(typeConge.getDecompteJours())) {
            SoldeConge solde = soldeCongeRepository.findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(userId, dto.getTypeCongeId(), annee)
                    .orElseGet(() -> {
                        double initialBalance = typeConge.getNombreJoursMax() != null
                                ? typeConge.getNombreJoursMax().doubleValue()
                                : 25.0;
                        SoldeConge newSolde = SoldeConge.builder()
                                .utilisateurId(userId)
                                .typeCongeId(dto.getTypeCongeId())
                                .annee(annee)
                                .joursAcquis(initialBalance)
                                .joursUtilises(0.0)
                                .joursRestants(initialBalance)
                                .joursEnAttente(0.0)
                                .build();
                        return soldeCongeRepository.save(newSolde);
                    });

            if (solde.getJoursRestants() < nombreJours) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Solde insuffisant.");
            }

            solde.setJoursEnAttente(solde.getJoursEnAttente() + nombreJours);
            soldeCongeRepository.save(solde);
        }

        Conge conge = congeMapper.toEntity(dto);
        conge.setUtilisateurId(userId);
        conge.setEntrepriseId(entrepriseId);
        conge.setNombreJours(nombreJours);
        conge.setStatut(StatutDemandeEnum.EN_ATTENTE_MANAGER);
        conge.setDateCreation(LocalDateTime.now());

        try {
            UserResponse user = organisationServiceClient.getUtilisateurById(userId);
            if (user != null && user.getManagerId() != null) {
                conge.setManagerId(user.getManagerId());
            }
        } catch (Exception e) {
            log.warn("Failed to resolve user manager: {}", e.getMessage());
        }

        Conge savedConge = congeRepository.save(conge);
        CongeDTO savedDto = congeMapper.toDto(savedConge);

        try {
            UserResponse user = organisationServiceClient.getUtilisateurById(userId);
            if (user != null && user.getManagerId() != null) {
                asyncNotificationService.sendToUser(user.getManagerId(), NotificationPayload.of(
                    "CONGE_SOUMIS",
                    "Nouvelle demande de congé",
                    user.getPrenom() + " " + user.getNom() + " a soumis une demande.",
                    "clock", "blue",
                    savedDto.getId(), "CONGE", "/app/manager/approbations"
                ), entrepriseId);
            }
        } catch (Exception e) {
            log.warn("Failed to send notification: {}", e.getMessage());
        }

        return savedDto;
    }

    @Override
    public CongeDTO validateByManager(Long id, Long managerId) {
        Conge conge = congeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        conge.setStatut(StatutDemandeEnum.EN_ATTENTE_RH);
        conge.setManagerId(managerId);
        conge.setDateDecision(LocalDateTime.now());
        Conge saved = congeRepository.save(conge);

        asyncNotificationService.sendToRole("ROLE_RH", NotificationPayload.of(
            "CONGE_VALIDATION_RH",
            "Congé en attente RH",
            "Une demande attend votre décision.",
            "check-circle", "purple",
            saved.getId(), "CONGE", "/app/rh/conges"
        ), conge.getEntrepriseId());

        return congeMapper.toDto(saved);
    }

    @Override
    public CongeDTO validateByRH(Long id, Long rhId) {
        Conge conge = congeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        TypeConge typeConge = typeCongeRepository.findById(conge.getTypeCongeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de conge introuvable"));
        
        if (Boolean.TRUE.equals(typeConge.getDecompteJours())) {
            SoldeConge solde = soldeCongeRepository.findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(
                    conge.getUtilisateurId(), conge.getTypeCongeId(), conge.getDateDebut().getYear()).orElseThrow();
            solde.setJoursRestants(solde.getJoursRestants() - conge.getNombreJours());
            solde.setJoursUtilises(solde.getJoursUtilises() + conge.getNombreJours());
            solde.setJoursEnAttente(solde.getJoursEnAttente() - conge.getNombreJours());
            soldeCongeRepository.save(solde);
        }

        conge.setStatut(StatutDemandeEnum.APPROUVE);
        conge.setDateDecision(LocalDateTime.now());
        Conge saved = congeRepository.save(conge);

        asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
            "CONGE_APPROUVE",
            "Congé Approuvé",
            "Votre demande a été acceptée.",
            "check-circle", "green",
            saved.getId(), "CONGE", "/app/employee/conges"
        ), conge.getEntrepriseId());

        return congeMapper.toDto(saved);
    }

    @Override
    public CongeDTO reject(Long id, Long validatorId, String commentaire) {
        Conge conge = congeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        TypeConge typeConge = typeCongeRepository.findById(conge.getTypeCongeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de conge introuvable"));
        
        if (Boolean.TRUE.equals(typeConge.getDecompteJours())) {
            SoldeConge solde = soldeCongeRepository.findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(
                    conge.getUtilisateurId(), conge.getTypeCongeId(), conge.getDateDebut().getYear()).orElseThrow();
            solde.setJoursEnAttente(solde.getJoursEnAttente() - conge.getNombreJours());
            soldeCongeRepository.save(solde);
        }

        conge.setStatut(StatutDemandeEnum.REFUSE);
        conge.setCommentaireValidateur(commentaire);
        conge.setDateDecision(LocalDateTime.now());
        Conge saved = congeRepository.save(conge);

        asyncNotificationService.sendToUser(saved.getUtilisateurId(), NotificationPayload.of(
            "CONGE_REFUSE",
            "Congé Refusé",
            "Votre demande a été refusée.",
            "user-x", "red",
            saved.getId(), "CONGE", "/app/employee/conges"
        ), conge.getEntrepriseId());

        return congeMapper.toDto(saved);
    }

    @Override
    public CongeDTO cancel(Long id) {
        Conge conge = congeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        TypeConge typeConge = typeCongeRepository.findById(conge.getTypeCongeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Type de conge introuvable"));
        
        if (Boolean.TRUE.equals(typeConge.getDecompteJours())) {
            SoldeConge solde = soldeCongeRepository.findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(
                    conge.getUtilisateurId(), conge.getTypeCongeId(), conge.getDateDebut().getYear()).orElseThrow();
            solde.setJoursEnAttente(solde.getJoursEnAttente() - conge.getNombreJours());
            soldeCongeRepository.save(solde);
        }

        conge.setStatut(StatutDemandeEnum.ANNULE);
        conge.setDateDecision(LocalDateTime.now());
        return congeMapper.toDto(congeRepository.save(conge));
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

    @Override
    @Transactional(readOnly = true)
    public CongeDTO getById(Long id) {
        CongeDTO dto = congeRepository.findById(id)
                .map(congeMapper::toDto)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande de conge introuvable"));
        enrichDto(dto);
        return dto;
    }

    private void enrichDto(CongeDTO dto) {
        try {
            if (dto.getUtilisateurId() != null) {
                UserResponse user = organisationServiceClient.getUtilisateurById(dto.getUtilisateurId());
                dto.setUserName(user.getPrenom() + " " + user.getNom());
                dto.setUserEmail(user.getEmail());
            }
            if (dto.getManagerId() != null) {
                UserResponse manager = organisationServiceClient.getUtilisateurById(dto.getManagerId());
                dto.setManagerName(manager.getPrenom() + " " + manager.getNom());
            }
            if (dto.getTypeCongeId() != null) {
                typeCongeRepository.findById(dto.getTypeCongeId())
                        .map(TypeConge::getLibelle)
                        .ifPresent(dto::setTypeCongeNom);
            }
        } catch (Exception e) {
            log.error("Failed to enrich: {}", e.getMessage());
        }
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
        List<CongeDTO> dtos = congeMapper.toDtoList(congeRepository.findAll());
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
}
