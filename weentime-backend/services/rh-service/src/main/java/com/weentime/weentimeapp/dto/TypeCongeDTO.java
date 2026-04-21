package com.weentime.weentimeapp.dto;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeCongeDTO {

    private Long id;

    private String libelle;

    private Integer nombreJoursMax;

    private Boolean decompteJours;

    private Boolean requireJustificatif;
}