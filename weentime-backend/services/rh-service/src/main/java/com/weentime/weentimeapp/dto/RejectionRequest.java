package com.weentime.weentimeapp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

/**
 * Payload du rejet RH d'une absence.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RejectionRequest {

    @NotBlank(message = "Le motif de refus est obligatoire")
    @Size(max = 1000, message = "Le motif ne peut pas dépasser 1000 caractères")
    private String motifRefus;
}
