package com.weentime.weentimeapp.dto;

import jakarta.validation.constraints.*;
import lombok.*;

import java.time.LocalDate;

/**
 * Payload de création d'une absence (EMPLOYEE → API).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AbsenceRequest {

    @NotNull(message = "Le type d'absence est obligatoire")
    private Long typeAbsenceId;

    @NotNull(message = "La date de début est obligatoire")
    private LocalDate dateDebut;

    @NotNull(message = "La date de fin est obligatoire")
    private LocalDate dateFin;

    @Size(min = 10, max = 1000, message = "Le motif doit contenir entre 10 et 1000 caractères")
    private String motif;

    /**
     * Justificatif encodé en Base64.
     */
    private String justificatif;
}
