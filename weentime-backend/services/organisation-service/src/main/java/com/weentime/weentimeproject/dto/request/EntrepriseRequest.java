package com.weentime.weentimeproject.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class EntrepriseRequest {

    @NotBlank(message = "Le nom est obligatoire")
    private String nom;

    @NotBlank(message = "Le SIRET est obligatoire")
    @Pattern(regexp = "\\d{14}", message = "Le SIRET doit contenir 14 chiffres")
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
}
