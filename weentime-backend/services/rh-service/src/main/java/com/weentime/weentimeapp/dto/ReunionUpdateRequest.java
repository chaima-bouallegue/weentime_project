package com.weentime.weentimeapp.dto;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalTime;

@Data
public class ReunionUpdateRequest {
    private String titre;
    private String description;
    private String agenda;
    private LocalDate dateReunion;
    private LocalTime heureDebut;
    private LocalTime heureFin;
    private String lieu;
    private String lienVisio;
}