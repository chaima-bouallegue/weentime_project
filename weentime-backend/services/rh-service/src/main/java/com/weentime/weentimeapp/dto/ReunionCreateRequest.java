package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.ReunionRecurrence;
import com.weentime.weentimeapp.enums.ReunionType;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
public class ReunionCreateRequest {
    private String titre;
    private String description;
    private LocalDate dateReunion;
    private LocalTime heureDebut;
    private LocalTime heureFin;
    private ReunionType type;
    private String lieu;
    private String lienVisio;
    private ReunionRecurrence recurrence;
    private List<Long> participantIds;
    private String agenda;
}
