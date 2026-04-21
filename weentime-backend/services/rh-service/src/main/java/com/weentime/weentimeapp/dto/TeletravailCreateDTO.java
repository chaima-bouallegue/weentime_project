package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.PeriodeTeletravailEnum;
import com.weentime.weentimeapp.enums.TypeTeletravailEnum;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TeletravailCreateDTO {
    @NotNull(message = "Le type de télétravail est obligatoire")
    private TypeTeletravailEnum type;

    @NotNull(message = "La date de début est obligatoire")
    private LocalDate dateDebut;

    @NotNull(message = "La date de fin est obligatoire")
    private LocalDate dateFin;

    private PeriodeTeletravailEnum periode;

    @Size(min = 10, max = 500, message = "Le motif doit contenir entre 10 et 500 caractères")
    private String motif;
}
