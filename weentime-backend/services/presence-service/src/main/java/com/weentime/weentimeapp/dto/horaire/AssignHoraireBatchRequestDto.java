package com.weentime.weentimeapp.dto.horaire;

import com.weentime.weentimeapp.enums.CibleType;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AssignHoraireBatchRequestDto {
    @NotNull
    private Long horaireId;
    @NotNull
    private CibleType cibleType;
    @NotEmpty
    private List<Long> cibleIds;
    private LocalDate dateDebut;
    private LocalDate dateFin;
    private String motif;
}
