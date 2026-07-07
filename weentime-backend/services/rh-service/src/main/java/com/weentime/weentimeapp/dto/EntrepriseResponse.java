package com.weentime.weentimeapp.dto;

import lombok.Data;

@Data
public class EntrepriseResponse {
    private Long id;
    private String nom;
    private String logo;
    private String primaryColor;
    private String secondaryColor;
    private String adresse;
    private String email;
    private String telephone;
    private String siteWeb;
}
