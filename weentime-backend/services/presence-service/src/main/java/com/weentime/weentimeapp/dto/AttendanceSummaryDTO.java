package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.OvertimeMode;
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
    private Long entrepriseId;
    private LocalDate date;
    private AttendanceDayStatus status;
    private Boolean lateArrival;
    private Boolean hasOpenSession;
    private Boolean checkedIn;
    private Boolean checkedOut;
    private Boolean canCheckIn;
    private Boolean canCheckOut;
    private String reasonIfBlocked;
    private Long totalDuration;
    private Integer currentSessionDuration;
    private String scheduledStart;
    private String scheduledEnd;
    private Integer expectedMinutes;
    private Integer workedMinutes;
    private Integer overtimePreview;
    private Integer overtimeMinutes;
    private OvertimeMode overtimeMode;
    private Boolean overtimeConfirmed;
    private Boolean showCheckoutAlert;
    private LocalDateTime overtimeStartedAt;
    private String overtimeLabel;
    private String leaveOrHolidayInfo;
    private String latestAlert;
    private LocalDateTime heureEntree;
    private LocalDateTime heureSortie;
    private String checkInLocation;
    private PointageLocationDTO checkInLocationDetails;
    private String checkOutLocation;
    private PointageLocationDTO checkOutLocationDetails;
    private PresenceSource source;
    private AttendanceSessionDTO activeSession;
    private List<AttendanceSessionDTO> sessions;
}
