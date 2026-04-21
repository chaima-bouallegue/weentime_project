package com.weentime.weentimeproject.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DepartementRequest {

    @NotBlank(message = "Le nom est obligatoire")
    @Size(min = 2, max = 100, message = "Le nom doit contenir entre 2 et 100 caractères")
    private String nom;

    @Size(max = 255, message = "La description ne peut pas dépasser 255 caractères")
    private String description;

    @NotBlank(message = "Le code interne est obligatoire")
    @Pattern(regexp = "^[A-Z0-9-]+$", message = "Le code interne doit contenir uniquement des lettres majuscules, chiffres et tirets")
    private String codeInterne;

    @NotNull(message = "L'entreprise est obligatoire")
    private Long entrepriseId;
}
