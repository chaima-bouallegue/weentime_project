package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.AttendanceSessionStatus;
import com.weentime.weentimeapp.enums.PresenceSource;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AttendanceSessionViewDTO {
    private Long id;
    private Long utilisateurId;
    private String nomComplet;
    private Long equipeId;
    private String equipe;
    private Long entrepriseId;
    private String entreprise;
    private LocalDate date;
    private LocalDateTime checkInTime;
    private LocalDateTime checkOutTime;
    private Long duration;
    private AttendanceSessionStatus status;
    private PresenceSource source;
    private String localisation;
    private Boolean lateArrival;
    private AttendanceDayStatus dailyStatus;
    private LocalDateTime createdAt;
}
