package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.PresenceSource;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AttendanceSummaryDTO {
    private Long utilisateurId;
    private LocalDate date;
    private AttendanceDayStatus status;
    private Boolean lateArrival;
    private Boolean hasOpenSession;
    private Long totalDuration;
    private LocalDateTime heureEntree;
    private LocalDateTime heureSortie;
    private PresenceSource source;
    private AttendanceSessionDTO activeSession;
    private List<AttendanceSessionDTO> sessions;
}
