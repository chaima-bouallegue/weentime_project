package com.weentime.weentimeproject.dto.response;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class EntrepriseResponse {

    // ── Identifiants
    private Long id;
    private String codeInvitation; // "WEEN-XXXXXXXXXXXX" — affiché dans l'UI

    // ── Informations légales
    private String nom;
    private String siret;
    private String secteur;
    private String adresse;
    private String telephone;
    private String email;
    private String siteWeb;
    private String logo;
    private String primaryColor;
    private String secondaryColor;

    // ── Statut
    private String status; // "ACTIVE" | "SUSPENDED" | "CLOSED"
    private Boolean estActive; // rétrocompatibilité

    // ── Capacité
    private Integer maxUsers;
    private Integer currentUsers;
    private LocalDateTime codeExpiration;

    // ── Métriques calculées (pour le frontend)
    private Integer employeesCount; // alias maxUsers
    private Integer activeUsers; // utilisateurs avec statut ACTIF
    private Integer hrManagers; // utilisateurs avec rôle ROLE_RH
    private Integer modulesEnabled; // TODO: depuis table modules (0 en V1)
    private LocalDateTime lastActivity; // updatedAt ?? createdAt
    private LocalDateTime lastLogin; // MAX(derniere_connexion) des utilisateurs

    private LocalDateTime createdAt;
    private Integer nombreDepartements;
}