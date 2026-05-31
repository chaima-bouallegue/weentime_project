package com.weentime.weentimeproject.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class EntrepriseRequest {

    // ── Champs français (rétrocompatibilité)
    @NotBlank(message = "Le nom est obligatoire")
    private String nom;

    @NotBlank(message = "Le SIRET est obligatoire")
    @Pattern(regexp = "\\d{14}", message = "Le SIRET doit contenir exactement 14 chiffres")
    private String siret;

    private String adresse;

    @Pattern(regexp = "\\d{8,15}", message = "Numéro de téléphone invalide")
    private String telephone;

    @Email(message = "Email invalide")
    private String email;

    private String siteWeb;
    private String secteur;
    private Integer maxUsers;
    private Boolean estActive;
    private String logo;

    // ── Champs anglais — alias frontend (name, sector, employeesCount, status)
    // Résolus dans le service via getEffectiveXxx() pour éviter deux champs
    // redondants dans l'entité.

    private String name;
    private String sector;
    private Integer employeesCount;

    @Pattern(regexp = "ACTIVE|SUSPENDED|CLOSED", message = "Statut invalide — valeurs acceptées : ACTIVE, SUSPENDED, CLOSED")
    private String status;

    // ── Helpers : résolution alias anglais → français

    public String getEffectiveNom() {
        return nom != null ? nom : name;
    }

    public String getEffectiveSecteur() {
        return secteur != null ? secteur : sector;
    }

    public Integer getEffectiveMaxUsers() {
        return maxUsers != null ? maxUsers : employeesCount;
    }

    public String getEffectiveStatus() {
        if (status != null)
            return status;
        if (Boolean.FALSE.equals(estActive))
            return "CLOSED";
        return "ACTIVE";
    }
}