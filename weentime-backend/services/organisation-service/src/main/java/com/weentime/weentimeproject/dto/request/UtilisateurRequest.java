package com.weentime.weentimeproject.dto.request;

import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Set;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UtilisateurRequest {
    @NotBlank(message = "Le nom est obligatoire")
    private String nom;
    @NotBlank(message = "Le prénom est obligatoire")
    private String prenom;
    @NotBlank(message = "L'email est obligatoire")
    @Email(message = "L'email doit être valide")
    private String email;
    @NotBlank(message = "Le mot de passe est obligatoire")
    private String motDePasse;
    private String telephone;
    private String poste;
    @NotNull(message = "Le statut est obligatoire")
    private StatutUtilisateurEnum statut;
    private Long entrepriseId;
    private Long departementId;
    private Long equipeId;
    private Set<Long> roleIds;
}
