package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.EnterpriseAccessControlRequest;
import com.weentime.weentimeproject.dto.response.EnterpriseAccessControlResponse;
import com.weentime.weentimeproject.dto.response.EnterpriseAccessUserResponse;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.RoleNom;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.EnterpriseAccessControlService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class EnterpriseAccessControlServiceImpl implements EnterpriseAccessControlService {

    private final EntrepriseRepository entrepriseRepository;
    private final UtilisateurRepository utilisateurRepository;

    @Override
    @Transactional(readOnly = true)
    public EnterpriseAccessControlResponse getEnterpriseAccessControl(Long enterpriseId) {
        Entreprise enterprise = findEnterprise(enterpriseId);
        List<Utilisateur> rhUsers = findUsersByRole(RoleNom.ROLE_RH);
        List<Utilisateur> managerUsers = findUsersByRole(RoleNom.ROLE_MANAGER);

        return buildResponse(enterprise, rhUsers, managerUsers);
    }

    @Override
    @Transactional
    public EnterpriseAccessControlResponse updateEnterpriseAccessControl(
            Long enterpriseId,
            EnterpriseAccessControlRequest request
    ) {
        Entreprise enterprise = findEnterprise(enterpriseId);
        Set<Long> selectedRhIds = sanitizeIds(request == null ? null : request.getRhUserIds());
        Set<Long> selectedManagerIds = sanitizeIds(request == null ? null : request.getManagerUserIds());

        List<Utilisateur> rhUsers = findUsersByRole(RoleNom.ROLE_RH);
        List<Utilisateur> managerUsers = findUsersByRole(RoleNom.ROLE_MANAGER);

        validateSelectedUsers(selectedRhIds, rhUsers, RoleNom.ROLE_RH);
        validateSelectedUsers(selectedManagerIds, managerUsers, RoleNom.ROLE_MANAGER);

        List<Utilisateur> changedUsers = new ArrayList<>();
        changedUsers.addAll(applyAssignments(enterprise, rhUsers, selectedRhIds));
        changedUsers.addAll(applyAssignments(enterprise, managerUsers, selectedManagerIds));

        if (!changedUsers.isEmpty()) {
            utilisateurRepository.saveAll(changedUsers);
        }

        return getEnterpriseAccessControl(enterpriseId);
    }

    private Entreprise findEnterprise(Long enterpriseId) {
        return entrepriseRepository.findById(enterpriseId)
                .orElseThrow(() -> new EntityNotFoundException("Entreprise introuvable: " + enterpriseId));
    }

    private List<Utilisateur> findUsersByRole(RoleNom roleName) {
        return utilisateurRepository.findByRoles_NomOrderByDateCreationDesc(roleName);
    }

    private Set<Long> sanitizeIds(List<Long> ids) {
        if (ids == null) {
            return Set.of();
        }

        return ids.stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(HashSet::new));
    }

    private void validateSelectedUsers(Set<Long> selectedIds, List<Utilisateur> roleUsers, RoleNom roleName) {
        Map<Long, Utilisateur> usersById = roleUsers.stream()
                .collect(Collectors.toMap(Utilisateur::getId, Function.identity()));

        for (Long selectedId : selectedIds) {
            if (!usersById.containsKey(selectedId)) {
                throw new IllegalArgumentException(
                        "L'utilisateur " + selectedId + " doit avoir le role " + roleName.name() + "."
                );
            }
        }
    }

    private List<Utilisateur> applyAssignments(
            Entreprise enterprise,
            List<Utilisateur> roleUsers,
            Set<Long> selectedIds
    ) {
        List<Utilisateur> changedUsers = new ArrayList<>();

        for (Utilisateur user : roleUsers) {
            boolean selected = selectedIds.contains(user.getId());
            boolean currentlyAssignedHere = Objects.equals(user.getEntrepriseId(), enterprise.getId());

            if (selected && !currentlyAssignedHere) {
                syncEnterpriseCounters(user.getEntrepriseId(), enterprise);
                assignToEnterprise(user, enterprise);
                changedUsers.add(user);
            } else if (!selected && currentlyAssignedHere) {
                decrementEnterpriseUsers(enterprise);
                clearEnterprise(user);
                changedUsers.add(user);
            }
        }

        return changedUsers;
    }

    private void assignToEnterprise(Utilisateur user, Entreprise enterprise) {
        user.setEntrepriseId(enterprise.getId());
        user.setEntreprise(enterprise);
    }

    private void clearEnterprise(Utilisateur user) {
        user.setEntrepriseId(null);
        user.setEntreprise(null);
    }

    private void syncEnterpriseCounters(Long previousEnterpriseId, Entreprise newEnterprise) {
        if (Objects.equals(previousEnterpriseId, newEnterprise.getId())) {
            return;
        }

        decrementEnterpriseUsers(previousEnterpriseId);
        incrementEnterpriseUsers(newEnterprise);
    }

    private void incrementEnterpriseUsers(Entreprise enterprise) {
        int currentUsers = enterprise.getCurrentUsers() == null ? 0 : enterprise.getCurrentUsers();
        enterprise.setCurrentUsers(currentUsers + 1);
        entrepriseRepository.save(enterprise);
    }

    private void decrementEnterpriseUsers(Long enterpriseId) {
        if (enterpriseId == null) {
            return;
        }

        entrepriseRepository.findById(enterpriseId).ifPresent(this::decrementEnterpriseUsers);
    }

    private void decrementEnterpriseUsers(Entreprise enterprise) {
        int currentUsers = enterprise.getCurrentUsers() == null ? 0 : enterprise.getCurrentUsers();
        enterprise.setCurrentUsers(Math.max(currentUsers - 1, 0));
        entrepriseRepository.save(enterprise);
    }

    private EnterpriseAccessControlResponse buildResponse(
            Entreprise enterprise,
            List<Utilisateur> rhUsers,
            List<Utilisateur> managerUsers
    ) {
        return EnterpriseAccessControlResponse.builder()
                .enterpriseId(enterprise.getId())
                .enterpriseName(enterprise.getNom())
                .rhUsers(mapUsers(rhUsers, RoleNom.ROLE_RH, enterprise.getId()))
                .managerUsers(mapUsers(managerUsers, RoleNom.ROLE_MANAGER, enterprise.getId()))
                .build();
    }

    private List<EnterpriseAccessUserResponse> mapUsers(
            List<Utilisateur> users,
            RoleNom roleName,
            Long enterpriseId
    ) {
        return users.stream()
                .map(user -> EnterpriseAccessUserResponse.builder()
                        .id(user.getId())
                        .fullName(resolveFullName(user))
                        .email(user.getEmail())
                        .role(roleName.name())
                        .allowed(Objects.equals(user.getEntrepriseId(), enterpriseId))
                        .build())
                .toList();
    }

    private String resolveFullName(Utilisateur user) {
        String fullName = String.join(" ",
                valueOrEmpty(user.getPrenom()),
                valueOrEmpty(user.getNom())
        ).trim();

        return fullName.isBlank() ? user.getEmail() : fullName;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }
}
