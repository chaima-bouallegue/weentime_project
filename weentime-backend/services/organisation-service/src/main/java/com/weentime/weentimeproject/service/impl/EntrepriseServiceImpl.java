package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.EntrepriseRequest;
import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import com.weentime.weentimeproject.dto.EntrepriseValidationDTO;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.mapper.EntrepriseMapper;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.service.EntrepriseService;
import jakarta.persistence.EntityNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

@Service
@Slf4j
@Transactional
public class EntrepriseServiceImpl implements EntrepriseService {

    private final EntrepriseRepository entrepriseRepository;
    private final EntrepriseMapper entrepriseMapper;

    public EntrepriseServiceImpl(EntrepriseRepository entrepriseRepository, EntrepriseMapper entrepriseMapper) {
        this.entrepriseRepository = entrepriseRepository;
        this.entrepriseMapper = entrepriseMapper;
    }

    private static final String ENTREPRISE_NOT_FOUND = "Entreprise non trouvée avec l'id : ";
    private static final String SIRET_ALREADY_EXISTS = "SIRET déjà utilisé : ";
    private static final String CODE_NOT_FOUND = "CODE_NOT_FOUND";
    private static final String ENTERPRISE_CLOSED = "ENTERPRISE_CLOSED";
    private static final String ENTERPRISE_FULL = "ENTERPRISE_FULL";
    private static final String INVITATION_INVALID_MESSAGE = "Code d'invitation invalide ou expiré.";
    private static final String INVITATION_LIMIT = "Nombre maximal d'utilisateurs atteint pour cette entreprise.";
    private static final String ENTERPRISE_CLOSED_MESSAGE = "Cette entreprise est fermée.";

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
    public EntrepriseValidationDTO validateCode(String codeInvitation) {
        String normalizedCode = normalizeInvitationCode(codeInvitation);
        if (normalizedCode.isBlank()) {
            return invalidValidation(CODE_NOT_FOUND, INVITATION_INVALID_MESSAGE);
        }

        Entreprise entreprise = findByInvitationCode(normalizedCode).orElse(null);
        if (entreprise == null) {
            return invalidValidation(CODE_NOT_FOUND, INVITATION_INVALID_MESSAGE);
        }

        if (!Boolean.TRUE.equals(entreprise.getEstActive())) {
            return invalidValidation(ENTERPRISE_CLOSED, ENTERPRISE_CLOSED_MESSAGE, entreprise);
        }

        if (entreprise.getCodeExpiration() != null
                && entreprise.getCodeExpiration().isBefore(LocalDateTime.now())) {
            return invalidValidation(CODE_NOT_FOUND, INVITATION_INVALID_MESSAGE);
        }

        if (entreprise.getMaxUsers() != null && entreprise.getCurrentUsers() != null
                && entreprise.getCurrentUsers() >= entreprise.getMaxUsers()) {
            return invalidValidation(ENTERPRISE_FULL, INVITATION_LIMIT, entreprise);
        }

        int collaborateurs = countCollaborateurs(entreprise);

        return EntrepriseValidationDTO.builder()
                .valid(true)
                .enterpriseId(entreprise.getId())
                .enterpriseName(entreprise.getNom())
                .status("ACTIVE")
                .invitationCode(publicInvitationCode(entreprise))
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
        String normalizedCode = normalizeInvitationCode(codeInvitation);
        Entreprise entreprise = findByInvitationCode(normalizedCode)
                .filter(e -> Boolean.TRUE.equals(e.getEstActive()))
                .orElseThrow(() -> new EntityNotFoundException(INVITATION_INVALID_MESSAGE + " : " + codeInvitation));
        return entrepriseMapper.toResponse(entreprise);
    }

    private java.util.Optional<Entreprise> findByInvitationCode(String normalizedCode) {
        return entrepriseRepository.findByNormalizedCodeInvitation(invitationCodeCandidates(normalizedCode));
    }

    private Set<String> invitationCodeCandidates(String normalizedCode) {
        Set<String> candidates = new LinkedHashSet<>();
        addInvitationCodeCandidate(candidates, normalizedCode);

        String suffix = invitationSuffix(normalizedCode);
        if (!suffix.isBlank()) {
            addInvitationCodeCandidate(candidates, suffix);
            addInvitationCodeCandidate(candidates, "WEEN-" + suffix);
            addInvitationCodeCandidate(candidates, "WEEN" + suffix);
        }

        return candidates;
    }

    private String normalizeInvitationCode(String code) {
        if (code == null) {
            return "";
        }
        String normalized = code.trim().toUpperCase(Locale.ROOT).replaceAll("\\s+", "");
        while (normalized.startsWith("#")) {
            normalized = normalized.substring(1);
        }
        if (normalized.startsWith("N-") && normalized.length() > 2) {
            return "WEEN-" + normalized.substring(2);
        }
        return normalized;
    }

    private void addInvitationCodeCandidate(Set<String> candidates, String candidate) {
        if (candidate != null && !candidate.isBlank()) {
            candidates.add(candidate);
        }
    }

    private String invitationSuffix(String normalizedCode) {
        if (normalizedCode.startsWith("WEEN-") && normalizedCode.length() > 5) {
            return normalizedCode.substring(5);
        }
        if (normalizedCode.startsWith("WEEN") && normalizedCode.length() > 4) {
            return normalizedCode.substring(4);
        }
        return "";
    }

    private String publicInvitationCode(Entreprise entreprise) {
        String normalized = normalizeInvitationCode(entreprise != null ? entreprise.getCodeInvitation() : null);
        String suffix = invitationSuffix(normalized);
        if (!suffix.isBlank()) {
            return "WEEN-" + suffix;
        }
        return normalized.matches("[A-Z0-9]{4,32}") ? "WEEN-" + normalized : normalized;
    }

    private EntrepriseValidationDTO invalidValidation(String reason, String message) {
        return invalidValidation(reason, message, null);
    }

    private EntrepriseValidationDTO invalidValidation(String reason, String message, Entreprise entreprise) {
        return EntrepriseValidationDTO.builder()
                .valid(false)
                .reason(reason)
                .message(message)
                .enterpriseId(entreprise != null ? entreprise.getId() : null)
                .enterpriseName(entreprise != null ? entreprise.getNom() : null)
                .status(entrepriseStatus(entreprise))
                .invitationCode(entreprise != null ? publicInvitationCode(entreprise) : null)
                .id(entreprise != null ? entreprise.getId() : null)
                .nom(entreprise != null ? entreprise.getNom() : null)
                .secteur(entreprise != null ? entreprise.getSecteur() : null)
                .collaborateurs(entreprise != null ? countCollaborateurs(entreprise) : 0)
                .build();
    }

    private String entrepriseStatus(Entreprise entreprise) {
        if (entreprise == null) {
            return null;
        }
        return Boolean.TRUE.equals(entreprise.getEstActive()) ? "ACTIVE" : "CLOSED";
    }

    private int countCollaborateurs(Entreprise entreprise) {
        int collaborateurs = 120;
        if (entreprise.getDepartements() != null && !entreprise.getDepartements().isEmpty()) {
            try {
                collaborateurs = (int) entreprise.getDepartements().stream()
                        .filter(Objects::nonNull)
                        .mapToLong(dep -> dep.getUtilisateurs() != null ? dep.getUtilisateurs().size() : 0)
                        .sum();
            } catch (Exception e) {
                collaborateurs = 120;
            }
        }
        return collaborateurs <= 0 ? 120 : collaborateurs;
    }
}
