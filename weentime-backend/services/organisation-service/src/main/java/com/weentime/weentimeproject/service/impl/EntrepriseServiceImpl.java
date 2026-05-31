package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.EntrepriseStatsDto;
import com.weentime.weentimeproject.dto.EntrepriseValidationDTO;
import com.weentime.weentimeproject.dto.request.EntrepriseRequest;
import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.mapper.EntrepriseMapper;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.service.EntrepriseService;
import jakarta.persistence.EntityNotFoundException;
import com.weentime.weentimeproject.exception.EntrepriseNotFoundException;
import com.weentime.weentimeproject.exception.SiretAlreadyExistsException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

@Service
@Slf4j
@RequiredArgsConstructor
@Transactional
public class EntrepriseServiceImpl implements EntrepriseService {

    private final EntrepriseRepository entrepriseRepository;
    private final EntrepriseMapper entrepriseMapper;

    // ── Messages d'erreur constants
    private static final String ENTREPRISE_NOT_FOUND  = "Entreprise non trouvée avec l'id : ";
    private static final String SIRET_ALREADY_EXISTS  = "SIRET déjà utilisé : ";
    private static final String CODE_NOT_FOUND        = "CODE_NOT_FOUND";
    private static final String ENTERPRISE_CLOSED     = "ENTERPRISE_CLOSED";
    private static final String ENTERPRISE_FULL       = "ENTERPRISE_FULL";
    private static final String INVITATION_INVALID    = "Code d'invitation invalide ou expiré.";
    private static final String INVITATION_LIMIT      = "Nombre maximal d'utilisateurs atteint pour cette entreprise.";
    private static final String ENTERPRISE_CLOSED_MSG = "Cette entreprise est fermée. Contactez votre administrateur.";

    // ══════════════════════════════════════════════════════════
    // CRUD
    // ══════════════════════════════════════════════════════════

    @Override
    public EntrepriseResponse createEntreprise(EntrepriseRequest request) {
        if (entrepriseRepository.existsBySiret(request.getSiret())) {
            throw new SiretAlreadyExistsException(request.getSiret());
        }
        Entreprise entreprise = entrepriseMapper.toEntity(request);
        // status déjà résolu via getEffectiveStatus() dans le mapper
        Entreprise saved = entrepriseRepository.save(entreprise);
        log.info("Entreprise créée — id={} code={}", saved.getId(), saved.getCodeInvitation());
        return entrepriseMapper.toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public EntrepriseResponse getEntrepriseById(Long id) {
        return entrepriseRepository.findById(id)
                .map(entrepriseMapper::toResponse)
                .orElseThrow(() -> new EntrepriseNotFoundException(id));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<EntrepriseResponse> getAllEntreprises(String status, String search, Pageable pageable) {
        String normalizedStatus = StringUtils.hasText(status) ? status.toUpperCase() : "ALL";
        String normalizedSearch = StringUtils.hasText(search) ? search.trim() : null;
        return entrepriseRepository
                .findAllByFilters(normalizedStatus, normalizedSearch, pageable)
                .map(entrepriseMapper::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<EntrepriseResponse> getAllEntreprises(Pageable pageable) {
        return getAllEntreprises("ALL", null, pageable);
    }

    @Override
    public EntrepriseResponse updateEntreprise(Long id, EntrepriseRequest request) {
        Entreprise entreprise = findOrThrow(id);

        if (!entreprise.getSiret().equals(request.getSiret())
                && entrepriseRepository.existsBySiretAndIdNot(request.getSiret(), id)) {
            throw new SiretAlreadyExistsException(request.getSiret());
        }

        entrepriseMapper.updateEntityFromRequest(request, entreprise);

        // Mise à jour status si fourni
        String newStatus = request.getEffectiveStatus();
        if (newStatus != null) {
            entreprise.setStatus(newStatus);
        }

        Entreprise saved = entrepriseRepository.save(entreprise);
        log.info("Entreprise mise à jour — id={}", saved.getId());
        return entrepriseMapper.toResponse(saved);
    }

    @Override
    public void deleteEntreprise(Long id) {
        Entreprise entreprise = findOrThrow(id);
        entreprise.close();  // soft delete — status = CLOSED
        entrepriseRepository.save(entreprise);
        log.info("Entreprise fermée (soft delete) — id={}", id);
    }

    // ══════════════════════════════════════════════════════════
    // Stats
    // ══════════════════════════════════════════════════════════

    @Override
    @Transactional(readOnly = true)
    public EntrepriseStatsDto getStats() {
        return entrepriseRepository.getStats();
    }

    // ══════════════════════════════════════════════════════════
    // Changement de statut
    // ══════════════════════════════════════════════════════════

    @Override
    public EntrepriseResponse changeStatus(Long id, String status) {
        Entreprise entreprise = findOrThrow(id);
        applyStatus(entreprise, status);
        Entreprise saved = entrepriseRepository.save(entreprise);
        log.info("Statut changé — id={} status={}", id, status);
        return entrepriseMapper.toResponse(saved);
    }

    // ══════════════════════════════════════════════════════════
    // Batch
    // ══════════════════════════════════════════════════════════

    @Override
    public void deleteBatch(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return;
        List<Entreprise> entreprises = entrepriseRepository.findAllById(ids);
        entreprises.forEach(Entreprise::close);
        entrepriseRepository.saveAll(entreprises);
        log.info("Batch soft-delete — {} entreprises fermées", entreprises.size());
    }

    @Override
    public void changeStatusBatch(List<Long> ids, String status) {
        if (ids == null || ids.isEmpty()) return;
        List<Entreprise> entreprises = entrepriseRepository.findAllById(ids);
        entreprises.forEach(e -> applyStatus(e, status));
        entrepriseRepository.saveAll(entreprises);
        log.info("Batch status change — {} entreprises → {}", entreprises.size(), status);
    }

    // ══════════════════════════════════════════════════════════
    // Code invitation
    // ══════════════════════════════════════════════════════════

    @Override
    @Transactional(readOnly = true)
    public EntrepriseValidationDTO validateCode(String codeInvitation) {
        String normalized = normalizeCode(codeInvitation);
        if (!StringUtils.hasText(normalized)) {
            return invalid(CODE_NOT_FOUND, INVITATION_INVALID, null);
        }
        Entreprise entreprise = findByCode(normalized).orElse(null);
        if (entreprise == null) {
            return invalid(CODE_NOT_FOUND, INVITATION_INVALID, null);
        }
        if (!entreprise.isActive()) {
            return invalid(ENTERPRISE_CLOSED, ENTERPRISE_CLOSED_MSG, entreprise);
        }
        if (entreprise.getMaxUsers() != null && entreprise.getCurrentUsers() != null
                && entreprise.getCurrentUsers() >= entreprise.getMaxUsers()) {
            return invalid(ENTERPRISE_FULL, INVITATION_LIMIT, entreprise);
        }
        return EntrepriseValidationDTO.builder()
                .valid(true)
                .enterpriseId(entreprise.getId())
                .enterpriseName(entreprise.getNom())
                .status("ACTIVE")
                .invitationCode(publicCode(entreprise))
                .id(entreprise.getId())
                .nom(entreprise.getNom())
                .secteur(entreprise.getSecteur())
                .collaborateurs(countCollaborateurs(entreprise))
                .build();
    }

    @Override
    public EntrepriseResponse regenerateInvitationCode(Long id) {
        Entreprise entreprise = findOrThrow(id);
        entreprise.regenerateCode();
        return entrepriseMapper.toResponse(entrepriseRepository.save(entreprise));
    }

    @Override
    @Transactional(readOnly = true)
    public EntrepriseResponse getByCode(String codeInvitation) {
        String normalized = normalizeCode(codeInvitation);
        return findByCode(normalized)
                .filter(Entreprise::isActive)
                .map(entrepriseMapper::toResponse)
                .orElseThrow(() -> new EntrepriseNotFoundException(
                        INVITATION_INVALID + " : " + codeInvitation));
    }

    // ══════════════════════════════════════════════════════════
    // Private helpers
    // ══════════════════════════════════════════════════════════

    private Entreprise findOrThrow(Long id) {
        return entrepriseRepository.findById(id)
                .orElseThrow(() -> new EntrepriseNotFoundException(id));
    }

    private void applyStatus(Entreprise e, String status) {
        switch (status.toUpperCase()) {
            case "ACTIVE"    -> e.activate();
            case "SUSPENDED" -> e.suspend();
            case "CLOSED"    -> e.close();
            default -> throw new IllegalArgumentException("Statut invalide : " + status);
        }
    }

    private java.util.Optional<Entreprise> findByCode(String normalized) {
        return entrepriseRepository.findByNormalizedCodeInvitation(
                buildCandidates(normalized));
    }

    private Set<String> buildCandidates(String normalized) {
        Set<String> candidates = new LinkedHashSet<>();
        addCandidate(candidates, normalized);
        String suffix = extractSuffix(normalized);
        if (StringUtils.hasText(suffix)) {
            addCandidate(candidates, suffix);
            addCandidate(candidates, "WEEN-" + suffix);
            addCandidate(candidates, "WEEN" + suffix);
        }
        return candidates;
    }

    private String normalizeCode(String code) {
        if (!StringUtils.hasText(code)) return "";
        String n = code.trim().toUpperCase(Locale.ROOT).replaceAll("\\s+", "");
        while (n.startsWith("#")) n = n.substring(1);
        if (n.startsWith("N-") && n.length() > 2) return "WEEN-" + n.substring(2);
        return n;
    }

    private void addCandidate(Set<String> candidates, String candidate) {
        if (StringUtils.hasText(candidate)) candidates.add(candidate);
    }

    private String extractSuffix(String normalized) {
        if (normalized.startsWith("WEEN-") && normalized.length() > 5)
            return normalized.substring(5);
        if (normalized.startsWith("WEEN") && normalized.length() > 4)
            return normalized.substring(4);
        return "";
    }

    private String publicCode(Entreprise e) {
        String n = normalizeCode(e != null ? e.getCodeInvitation() : null);
        String suffix = extractSuffix(n);
        if (StringUtils.hasText(suffix)) return "WEEN-" + suffix;
        return n.matches("[A-Z0-9]{4,32}") ? "WEEN-" + n : n;
    }

    private EntrepriseValidationDTO invalid(String reason, String message, Entreprise e) {
        return EntrepriseValidationDTO.builder()
                .valid(false)
                .reason(reason)
                .message(message)
                .enterpriseId(e != null ? e.getId() : null)
                .enterpriseName(e != null ? e.getNom() : null)
                .status(e != null ? e.getStatus() : null)
                .invitationCode(e != null ? publicCode(e) : null)
                .id(e != null ? e.getId() : null)
                .nom(e != null ? e.getNom() : null)
                .secteur(e != null ? e.getSecteur() : null)
                .collaborateurs(e != null ? countCollaborateurs(e) : 0)
                .build();
    }

    private int countCollaborateurs(Entreprise e) {
        if (e.getDepartements() == null || e.getDepartements().isEmpty()) return 0;
        try {
            return (int) e.getDepartements().stream()
                    .filter(Objects::nonNull)
                    .mapToLong(d -> d.getUtilisateurs() != null
                            ? d.getUtilisateurs().size() : 0)
                    .sum();
        } catch (Exception ex) {
            log.warn("Erreur calcul collaborateurs pour entreprise id={}", e.getId(), ex);
            return 0;
        }
    }
}