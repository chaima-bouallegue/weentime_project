package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.DemandeDTO;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.mapper.DemandeMapper;
import com.weentime.weentimeapp.repository.DemandeRepository;
import com.weentime.weentimeapp.service.DemandeService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
@Transactional
@SuppressWarnings("null")
public class DemandeServiceImpl implements DemandeService {

    private final DemandeRepository demandeRepository;
    private final DemandeMapper demandeMapper;
    private final OrganisationServiceClient organisationServiceClient;

    @Override
    @Transactional(readOnly = true)
    public DemandeDTO getById(Long id) {
        return demandeRepository.findById(id)
                .map(demandeMapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("Demande not found"));
    }

    @Override
    public List<DemandeDTO> getAllByUtilisateur(Long utilisateurId) {
        return enrich(demandeMapper.toDtoList(demandeRepository.findAll().stream()
                .filter(demande -> Objects.equals(demande.getUtilisateurId(), utilisateurId))
                .toList()));
    }

    @Override
    public List<DemandeDTO> getByManager(Long managerId) {
        return enrich(demandeMapper.toDtoList(demandeRepository.findAll().stream()
                .filter(demande -> Objects.equals(demande.getManagerId(), managerId))
                .toList()));
    }

    @Override
    public List<DemandeDTO> getAll() {
        return enrich(demandeMapper.toDtoList(demandeRepository.findAll()));
    }

    @Override
    public List<DemandeDTO> getAllForEntreprise(Long entrepriseId) {
        if (entrepriseId == null) {
            return List.of();
        }
        return enrich(demandeMapper.toDtoList(demandeRepository.findByEntrepriseIdOrderByDateCreationDesc(entrepriseId)));
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
        try {
            return organisationServiceClient.getUtilisateurById(userId);
        } catch (Exception exception) {
            return null;
        }
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
