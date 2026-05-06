package com.weentime.communication.dto;

import java.util.List;

public record OrganisationUserSummary(
        Long id,
        String nom,
        String prenom,
        String fullName,
        String email,
        String poste,
        String avatarUrl,
        String photo,
        Long managerId,
        Long departementId,
        String departement,
        Long equipeId,
        String equipe,
        Long entrepriseId,
        String entreprise,
        List<String> roles,
        boolean active
) {
    public String resolvedAvatarUrl() {
        return avatarUrl != null && !avatarUrl.isBlank() ? avatarUrl : photo;
    }

    public String resolvedFullName() {
        if (fullName != null && !fullName.isBlank()) {
            return fullName;
        }
        String joined = ((prenom == null ? "" : prenom.trim()) + " " + (nom == null ? "" : nom.trim())).trim();
        return joined.isBlank() ? email : joined;
    }

    public String primaryRole() {
        return roles == null || roles.isEmpty() ? "EMPLOYEE" : normalizeRole(roles.get(0));
    }

    private String normalizeRole(String value) {
        if (value == null) {
            return "EMPLOYEE";
        }
        String normalized = value.trim().toUpperCase();
        return normalized.startsWith("ROLE_") ? normalized.substring("ROLE_".length()) : normalized;
    }
}
