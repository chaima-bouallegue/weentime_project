package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.EntrepriseRequest;
import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.mapper.EntrepriseMapper;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.service.EntrepriseService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Transactional
public class EntrepriseServiceImpl implements EntrepriseService {

    private static final String ENTREPRISE_NOT_FOUND = "Entreprise non trouv\u00e9e avec l'id : ";
    private static final String SIRET_ALREADY_EXISTS = "SIRET d\u00e9j\u00e0 utilis\u00e9 : ";
    private static final String INVITATION_INVALID = "Code d'invitation invalide ou expir\u00e9 : ";
    private static final String INVITATION_LIMIT = "Nombre maximal d'utilisateurs atteint pour cette entreprise.";

    private final EntrepriseRepository entrepriseRepository;
    private final EntrepriseMapper entrepriseMapper;

    @Override
    public EntrepriseResponse createEntreprise(EntrepriseRequest request) {
        if (entrepriseRepository.existsBySiret(request.getSiret())) {
            throw new IllegalArgumentException(SIRET_ALREADY_EXISTS + request.getSiret());
        }

        Entreprise entreprise = entrepriseMapper.toEntity(request);
        entreprise.setEstActive(request.getEstActive() != null ? request.getEstActive() : Boolean.TRUE);
        if (request.getMaxUsers() != null) {
            entreprise.setMaxUsers(request.getMaxUsers());
        }

        Entreprise saved = entrepriseRepository.save(entreprise);
        return entrepriseMapper.toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public EntrepriseResponse getEntrepriseById(Long id) {
        return entrepriseRepository.findById(id)
                .map(entrepriseMapper::toResponse)
                .orElseThrow(() -> new EntityNotFoundException(ENTREPRISE_NOT_FOUND + id));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<EntrepriseResponse> getAllEntreprises(Pageable pageable) {
        return entrepriseRepository.findAll(pageable)
                .map(entrepriseMapper::toResponse);
    }

    @Override
    public EntrepriseResponse updateEntreprise(Long id, EntrepriseRequest request) {
        Entreprise entreprise = entrepriseRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(ENTREPRISE_NOT_FOUND + id));

        if (!entreprise.getSiret().equals(request.getSiret()) &&
                entrepriseRepository.existsBySiret(request.getSiret())) {
            throw new IllegalArgumentException(SIRET_ALREADY_EXISTS + request.getSiret());
        }

        entrepriseMapper.updateEntityFromRequest(request, entreprise);
        if (request.getMaxUsers() != null) {
            entreprise.setMaxUsers(request.getMaxUsers());
        }
        if (request.getEstActive() != null) {
            entreprise.setEstActive(request.getEstActive());
        }
        Entreprise saved = entrepriseRepository.save(entreprise);
        return entrepriseMapper.toResponse(saved);
    }

    @Override
    public void deleteEntreprise(Long id) {
        Entreprise entreprise = entrepriseRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(ENTREPRISE_NOT_FOUND + id));

        entreprise.setEstActive(Boolean.FALSE);
        entrepriseRepository.save(entreprise);
    }

    @Override
    @Transactional(readOnly = true)
    public com.weentime.weentimeproject.dto.EntrepriseValidationDTO validateCode(String codeInvitation) {
        Entreprise entreprise = entrepriseRepository.findByCodeInvitation(codeInvitation)
                .filter(e -> Boolean.TRUE.equals(e.getEstActive()))
                .orElseThrow(() -> new EntityNotFoundException(INVITATION_INVALID + codeInvitation));

        if (entreprise.getCodeExpiration() != null && entreprise.getCodeExpiration().isBefore(LocalDateTime.now())) {
            throw new EntityNotFoundException(INVITATION_INVALID + codeInvitation);
        }
        if (entreprise.getMaxUsers() != null && entreprise.getCurrentUsers() != null
                && entreprise.getCurrentUsers() >= entreprise.getMaxUsers()) {
            throw new IllegalStateException(INVITATION_LIMIT);
        }

        int collaborateurs = entreprise.getDepartements() != null ?
                entreprise.getDepartements().stream()
                        .mapToInt(dep -> dep.getUtilisateurs() != null ? dep.getUtilisateurs().size() : 0)
                        .sum() : 120;
        if (collaborateurs == 0) collaborateurs = 120;

        return com.weentime.weentimeproject.dto.EntrepriseValidationDTO.builder()
                .id(entreprise.getId())
                .nom(entreprise.getNom())
                .secteur(entreprise.getSecteur())
                .collaborateurs(collaborateurs)
                .build();
    }

    @Override
    public EntrepriseResponse regenerateInvitationCode(Long id) {
        Entreprise entreprise = entrepriseRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(ENTREPRISE_NOT_FOUND + id));
        entreprise.regenerateCode();
        Entreprise saved = entrepriseRepository.save(entreprise);
        return entrepriseMapper.toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public EntrepriseResponse getByCode(String codeInvitation) {
        Entreprise entreprise = entrepriseRepository.findByCodeInvitation(codeInvitation)
                .filter(e -> Boolean.TRUE.equals(e.getEstActive()))
                .orElseThrow(() -> new EntityNotFoundException(INVITATION_INVALID + codeInvitation));
        return entrepriseMapper.toResponse(entreprise);
    }
}
