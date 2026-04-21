package com.weentime.weentimeapp.dto.horaire;

import com.weentime.weentimeapp.enums.CibleType;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AssignHoraireRequestDto {
    @NotNull
    private Long horaireId;
    @NotNull
    private CibleType cibleType;
    @NotNull
    private Long cibleId;
    private LocalDate dateDebut;
    private LocalDate dateFin;
    private String motif;
}
