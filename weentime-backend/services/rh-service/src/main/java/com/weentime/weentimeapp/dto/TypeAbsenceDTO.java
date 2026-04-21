package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.TypeAbsenceEnum;
import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeAbsenceDTO {

    private Long id;

    private String libelle;

    private TypeAbsenceEnum type;

    private Boolean requireJustificatif;

    private Integer nombreJoursMax;

    private Boolean decompteJours;
}