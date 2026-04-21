package com.weentime.weentimeproject.dto.response;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class EntrepriseResponse {
    private Long id;
    private String nom;
    private String siret;
    private String adresse;
    private String telephone;
    private String email;
    private String siteWeb;
    private String secteur;
    private String codeInvitation;
    private LocalDateTime codeExpiration;
    private Integer maxUsers;
    private Integer currentUsers;
    private Boolean estActive;
    private LocalDateTime createdAt;
    private Integer nombreDepartements;
}
