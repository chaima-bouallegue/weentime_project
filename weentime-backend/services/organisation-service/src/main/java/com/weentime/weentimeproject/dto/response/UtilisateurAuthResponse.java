package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Set;

/**
 * DTO dédié à l'authentification, renvoyé uniquement via l'endpoint interne
 * /auth/by-email. Contient le motDePasse hashé et les noms de rôles
 * sous forme de String pour être compatible avec UtilisateurAuthDTO côté auth-service.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UtilisateurAuthResponse {
    private Long id;
    private String email;
    private String motDePasse;
    private String telephone;
    private String statut;
    private Long entrepriseId;
    private Set<RoleDTO> roles;
    private boolean twoFactorEnabled;
    private String twoFactorType;
    private String twoFactorSecret;
    private int failed2faAttempts;
    private LocalDateTime lockoutEnd;
    private Set<String> backupCodes;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class RoleDTO {
        private String nom;
    }
}
