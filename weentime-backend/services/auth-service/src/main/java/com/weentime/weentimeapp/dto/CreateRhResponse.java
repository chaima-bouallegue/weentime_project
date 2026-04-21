package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateRhResponse {
    private Long id;
    private String nom;
    private String prenom;
    private String email;
    private String telephone;
    private Long entrepriseId;
    private String entrepriseNom;
    private String statut;
    private LocalDateTime dateCreation;
}
