package com.weentime.weentimeproject.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Set;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserProfileResponse {
    private Long id;
    private String nom;
    private String prenom;
    private String email;
    private String telephone;
    private String poste;
    private String avatarUrl;
    private String photo;
    private String statut;
    private boolean twoFactorEnabled;
    private String twoFactorType;
    private LocalDateTime dateCreation;
    private DepartementDto departement;
    private EquipeDto equipe;
    private EntrepriseDto entreprise;
    private Set<String> roles;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DepartementDto {
        private Long id;
        private String nom;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class EquipeDto {
        private Long id;
        private String nom;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class EntrepriseDto {
        private Long id;
        private String nom;
    }
}
