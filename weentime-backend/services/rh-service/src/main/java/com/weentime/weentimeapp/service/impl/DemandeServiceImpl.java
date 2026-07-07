package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.DemandeDTO;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.entity.*;
import com.weentime.weentimeapp.mapper.DemandeMapper;
import com.weentime.weentimeapp.repository.DemandeRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.DemandeService;
import com.weentime.weentimeapp.service.UserCacheService;
import com.weentime.weentimeapp.entity.TypeConge;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
@Transactional
@SuppressWarnings("null")
@Slf4j
public class DemandeServiceImpl implements DemandeService {

    private final DemandeRepository demandeRepository;
    private final DemandeMapper demandeMapper;
    private final OrganisationServiceClient organisationServiceClient;
    private final TypeCongeRepository typeCongeRepository;
    private final UserCacheService userCacheService;

    @Override
    @Transactional(readOnly = true)
    public DemandeDTO getById(Long id) {
        return demandeRepository.findById(id)
                .map(demandeMapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("Demande not found"));
    }

    @Override
    public List<DemandeDTO> getAllByUtilisateur(Long utilisateurId) {
        List<Demande> entities = demandeRepository.findByUtilisateurIdInOrderByDateCreationDesc(List.of(utilisateurId));
        return enrich(demandeMapper.toDtoList(entities), entities);
    }

    @Override
    public List<DemandeDTO> getByManager(Long managerId) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            UserResponse manager = safeGetUser(managerId);
            if (manager != null) entrepriseId = manager.getEntrepriseId();
        }

        if (entrepriseId == null) {
            return enrich(demandeMapper.toDtoList(demandeRepository.findByManagerIdOrderByDateCreationDesc(managerId)));
        }

        List<UserResponse> users = organisationServiceClient.findUsersByEntreprise(entrepriseId);
        List<Long> teamMemberIds = (users == null) ? List.of() : users.stream()
                .filter(user -> managerId.equals(user.getManagerId()))
                .map(UserResponse::getId)
                .toList();

        if (teamMemberIds.isEmpty()) {
            List<Demande> entities = demandeRepository.findByManagerIdOrderByDateCreationDesc(managerId);
            return enrich(demandeMapper.toDtoList(entities), entities);
        }

        List<Demande> entities = demandeRepository.findByUtilisateurIdInOrderByDateCreationDesc(teamMemberIds);
        return enrich(demandeMapper.toDtoList(entities), entities);
    }

    @Override
    public List<DemandeDTO> getAll() {
        List<Demande> entities = demandeRepository.findAll();
        return enrich(demandeMapper.toDtoList(entities), entities);
    }

    @Override
    public List<DemandeDTO> getAllForEntreprise(Long entrepriseId) {
        if (entrepriseId == null) {
            return List.of();
        }
        List<Demande> entities = demandeRepository.findByEntrepriseIdOrderByDateCreationDesc(entrepriseId);
        return enrich(demandeMapper.toDtoList(entities), entities);
    }

    private List<DemandeDTO> enrich(List<DemandeDTO> demandes, List<Demande> entities) {
        if (demandes.size() != entities.size()) {
             return enrich(demandes); // Fallback if count mismatch
        }

        // Batch fetch TypeConge libellés avant la boucle
        Set<Long> typeCongeIds = entities.stream()
                .filter(Conge.class::isInstance)
                .map(Conge.class::cast)
                .map(Conge::getTypeCongeId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, String> typeCongeLibelles = typeCongeIds.isEmpty()
                ? Map.of()
                : typeCongeRepository.findAllById(typeCongeIds).stream()
                        .collect(Collectors.toMap(TypeConge::getId, TypeConge::getLibelle, (a, b) -> a, LinkedHashMap::new));

        for (int i = 0; i < demandes.size(); i++) {
            DemandeDTO dto = demandes.get(i);
            Demande entity = entities.get(i);
            
            if (entity instanceof Conge c) {
                dto.setDateDebut(c.getDateDebut() != null ? c.getDateDebut().atStartOfDay() : null);
                dto.setDateFin(c.getDateFin() != null ? c.getDateFin().atStartOfDay() : null);
                dto.setNombreJours(c.getNombreJours() != null ? c.getNombreJours().doubleValue() : 0.0);
                if (c.getTypeCongeId() != null) {
                    dto.setTypeCongeNom(typeCongeLibelles.get(c.getTypeCongeId()));
                }
            } else if (entity instanceof Teletravail t) {
                dto.setDateDebut(t.getDateDebut() != null ? t.getDateDebut().atStartOfDay() : null);
                dto.setDateFin(t.getDateFin() != null ? t.getDateFin().atStartOfDay() : null);
                dto.setNombreJours(t.getNombreJours());
            } else if (entity instanceof Autorisation a) {
                dto.setDateDebut(a.getDateAutorisation() != null && a.getHeureDebut() != null ? 
                                 a.getDateAutorisation().atTime(a.getHeureDebut()) : null);
                dto.setDateFin(a.getDateAutorisation() != null && a.getHeureFin() != null ? 
                                 a.getDateAutorisation().atTime(a.getHeureFin()) : null);
                dto.setNombreJours(a.getDuree() != null ? a.getDuree() / 60.0 : 0.0);
                try {
                    if (a.getTypeAutorisation() != null) {
                        dto.setTypeAutorisation(a.getTypeAutorisation().getLibelle());
                    }
                } catch (Exception exception) {
                    log.warn("Unable to resolve type autorisation for demande {}: {}", dto.getId(), exception.getMessage());
                }
            }
        }
        
        return enrich(demandes);
    }

    private List<DemandeDTO> enrich(List<DemandeDTO> demandes) {
        List<Long> userIds = demandes.stream()
                .flatMap(demande -> Stream.of(demande.getUtilisateurId(), demande.getManagerId()))
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        Map<Long, UserResponse> usersById = userIds.stream()
                .map(this::safeGetUser)
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(UserResponse::getId, user -> user, (left, right) -> left, LinkedHashMap::new));

        demandes.forEach(demande -> {
            demande.setUtilisateur(toProfile(usersById.get(demande.getUtilisateurId())));
            demande.setManager(toProfile(usersById.get(demande.getManagerId())));
        });
        return demandes;
    }

    private UserResponse safeGetUser(Long userId) {
        if (userId == null) {
            return null;
        }
        return userCacheService.getOrLoad(userId, id -> {
            try {
                return organisationServiceClient.getUtilisateurById(id);
            } catch (Exception e) {
                log.warn("Impossible de récupérer l'utilisateur {}", id);
                return null;
            }
        });
    }

    private Map<String, Object> toProfile(UserResponse user) {
        if (user == null) {
            return null;
        }

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", user.getId());
        profile.put("nom", user.getNom());
        profile.put("prenom", user.getPrenom());
        profile.put("fullName", Stream.of(user.getPrenom(), user.getNom())
                .filter(Objects::nonNull)
                .filter(value -> !value.isBlank())
                .collect(Collectors.joining(" ")).trim());
        profile.put("email", user.getEmail());
        profile.put("poste", user.getPoste());
        profile.put("departement", user.getDepartementNom());
        profile.put("equipe", user.getEquipe());
        return profile;
    }
}
