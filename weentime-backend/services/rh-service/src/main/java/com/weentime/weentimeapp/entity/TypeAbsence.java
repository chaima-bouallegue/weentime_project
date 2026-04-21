package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.TypeAbsenceEnum;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "type_absences")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeAbsence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String libelle;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TypeAbsenceEnum type;

    private Boolean requireJustificatif;

    private Integer nombreJoursMax;

    private Boolean decompteJours;
}