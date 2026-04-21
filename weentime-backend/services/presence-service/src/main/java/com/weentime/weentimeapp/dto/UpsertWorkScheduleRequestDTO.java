package com.weentime.weentimeapp.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpsertWorkScheduleRequestDTO {

    @NotNull(message = "heureDebut est obligatoire")
    private LocalTime heureDebut;

    @NotNull(message = "heureFin est obligatoire")
    private LocalTime heureFin;

    @NotEmpty(message = "joursTravail est obligatoire")
    private Set<DayOfWeek> joursTravail;

    @NotNull(message = "toleranceRetardMinutes est obligatoire")
    @Min(value = 0, message = "toleranceRetardMinutes doit etre >= 0")
    @Max(value = 180, message = "toleranceRetardMinutes doit etre <= 180")
    private Integer toleranceRetardMinutes;
}
