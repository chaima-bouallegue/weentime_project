package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.*;
import com.weentime.weentimeproject.entity.*;
import com.weentime.weentimeproject.enums.AccessRole;
import com.weentime.weentimeproject.enums.ModuleKey;
import com.weentime.weentimeproject.exception.AccessControlValidationException;
import com.weentime.weentimeproject.repository.*;
import com.weentime.weentimeproject.service.EntrepriseAccessControlService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class EntrepriseAccessControlServiceImpl
        implements EntrepriseAccessControlService {

    private final EntrepriseRepository                    entrepriseRepository;
    private final EntrepriseAccessControlRepository       accessControlRepository;
    private final EntrepriseAccessControlHistoryRepository historyRepository;

    // ──────────────────────────────────────────────────────────
    // READ
    // ──────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public EntrepriseAccessControlDto getAccessControl(Long entrepriseId) {
        Entreprise entreprise = findEntrepriseOrThrow(entrepriseId);

        // Récupérer les configs existantes
        List<EntrepriseAccessControl> existing =
                accessControlRepository.findAllByEntrepriseId(entrepriseId);

        // Indexer pour lookup O(1)
        Map<String, Boolean> configMap = existing.stream().collect(
                Collectors.toMap(
                        e -> e.getRole() + ":" + e.getModuleKey(),
                        EntrepriseAccessControl::isEnabled));

        // Construire la matrice complète — tous rôles × tous modules
        List<RolePermissionDto> permissions = Arrays.stream(AccessRole.values())
                .map(role -> {
                    List<ModulePermissionDto> modules = Arrays.stream(ModuleKey.values())
                            .map(module -> ModulePermissionDto.builder()
                                    .key(module.name())
                                    .label(module.getLabel())
                                    .enabled(configMap.getOrDefault(
                                            role.name() + ":" + module.name(), true))
                                    .build())
                            .toList();
                    return RolePermissionDto.builder()
                            .role(role.name())
                            .label(role.getLabel())
                            .modules(modules)
                            .build();
                })
                .toList();

        // Récupérer les métadonnées de dernière modification
        existing.stream()
                .max(Comparator.comparing(
                        e -> e.getUpdatedAt() != null
                                ? e.getUpdatedAt() : LocalDateTime.MIN))
                .ifPresent(last -> log.debug(
                        "Last AC update entreprise={} at={} by={}",
                        entrepriseId, last.getUpdatedAt(), last.getUpdatedBy()));

        Optional<EntrepriseAccessControl> lastUpdated = existing.stream()
                .filter(e -> e.getUpdatedAt() != null)
                .max(Comparator.comparing(EntrepriseAccessControl::getUpdatedAt));

        return EntrepriseAccessControlDto.builder()
                .entrepriseId(entrepriseId)
                .codeInvitation(entreprise.getCodeInvitation())
                .permissions(permissions)
                .updatedAt(lastUpdated.map(EntrepriseAccessControl::getUpdatedAt)
                        .orElse(null))
                .updatedBy(lastUpdated.map(EntrepriseAccessControl::getUpdatedBy)
                        .orElse(null))
                .build();
    }

    // ──────────────────────────────────────────────────────────
    // WRITE
    // ──────────────────────────────────────────────────────────

    @Override
    @CacheEvict(value = "moduleAccess", key = "#entrepriseId")
    public EntrepriseAccessControlDto updateAccessControl(
            Long entrepriseId,
            EntrepriseAccessControlDto request,
            String updatedBy) {

        findEntrepriseOrThrow(entrepriseId);
        validatePermissions(request.getPermissions());

        List<EntrepriseAccessControlHistory> auditEntries = new ArrayList<>();

        request.getPermissions().forEach(roleDto ->
                roleDto.getModules().forEach(moduleDto -> {

                    EntrepriseAccessControl config = accessControlRepository
                            .findByEntrepriseIdAndRoleAndModuleKey(
                                    entrepriseId,
                                    roleDto.getRole(),
                                    moduleDto.getKey())
                            .orElseGet(() -> EntrepriseAccessControl.defaultFor(
                                    entrepriseId,
                                    roleDto.getRole(),
                                    moduleDto.getKey()));

                    // Audit uniquement si changement réel
                    if (config.isEnabled() != moduleDto.isEnabled()) {
                        auditEntries.add(EntrepriseAccessControlHistory.of(
                                entrepriseId,
                                updatedBy,
                                roleDto.getRole(),
                                moduleDto.getKey(),
                                config.isEnabled(),
                                moduleDto.isEnabled()));
                        log.info("AC change entreprise={} role={} module={} {}→{}",
                                entrepriseId, roleDto.getRole(), moduleDto.getKey(),
                                config.isEnabled(), moduleDto.isEnabled());
                    }

                    config.setEnabled(moduleDto.isEnabled());
                    config.setUpdatedBy(updatedBy);
                    accessControlRepository.save(config);
                }));

        // Écriture audit en batch
        if (!auditEntries.isEmpty()) {
            historyRepository.saveAll(auditEntries);
        }

        return getAccessControl(entrepriseId);
    }

    // ──────────────────────────────────────────────────────────
    // HISTORY
    // ──────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public List<EntrepriseAccessControlHistoryDto> getHistory(Long entrepriseId) {
        findEntrepriseOrThrow(entrepriseId);
        return historyRepository
                .findAllByEntrepriseIdOrderByChangedAtDesc(entrepriseId)
                .stream()
                .map(h -> EntrepriseAccessControlHistoryDto.builder()
                        .id(h.getId())
                        .changedBy(h.getChangedBy())
                        .changedAt(h.getChangedAt())
                        .role(h.getRole())
                        .moduleKey(h.getModuleKey())
                        .previousValue(h.isPreviousValue())
                        .newValue(h.isNewValue())
                        .build())
                .toList();
    }

    // ──────────────────────────────────────────────────────────
    // MODULE CHECK (appelé par l'intercepteur)
    // ──────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    @Cacheable(value = "moduleAccess",
               key = "#entrepriseId + ':' + #role + ':' + #moduleKey")
    public boolean isModuleEnabled(Long entrepriseId, String role, String moduleKey) {
        return accessControlRepository
                .findEnabledByEntrepriseIdAndRoleAndModuleKey(
                        entrepriseId, role, moduleKey)
                .orElse(true); // fail-open : pas de config = accès autorisé
    }

    // ──────────────────────────────────────────────────────────
    // Validation métier
    // ──────────────────────────────────────────────────────────

    private void validatePermissions(List<RolePermissionDto> permissions) {
        if (permissions == null || permissions.isEmpty()) {
            throw new AccessControlValidationException(
                    "ACCESS_CONTROL_EMPTY",
                    "Les permissions ne peuvent pas être vides.");
        }
        permissions.forEach(roleDto -> {
            boolean allDisabled = roleDto.getModules().stream()
                    .noneMatch(ModulePermissionDto::isEnabled);
            if (allDisabled) {
                throw new AccessControlValidationException(
                        "ACCESS_CONTROL_ALL_MODULES_DISABLED",
                        "Impossible de désactiver tous les modules pour le rôle : "
                                + roleDto.getRole()
                                + ". Au moins un module doit rester actif.");
            }
        });
    }

    private Entreprise findEntrepriseOrThrow(Long id) {
        return entrepriseRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Entreprise non trouvée avec l'id : " + id));
    }
}