package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.ReunionRecurrence;
import com.weentime.weentimeapp.enums.ReunionStatut;
import com.weentime.weentimeapp.enums.ReunionType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReunionDTO {
    private Long id;
    private String uuid;
    private String titre;
    private String description;
    private LocalDate dateReunion;
    private LocalTime heureDebut;
    private LocalTime heureFin;
    private ReunionType type;
    private String lieu;
    private String lienVisio;
    private ReunionStatut statut;
    private ReunionRecurrence recurrence;
    private Long organisateurId;
    private Long entrepriseId;
    private String compteRendu;
    private String agenda;
    private List<ParticipantReunionDTO> participants;
}
