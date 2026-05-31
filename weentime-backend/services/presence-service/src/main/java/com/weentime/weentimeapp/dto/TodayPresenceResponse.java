package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.OvertimeMode;
import com.weentime.weentimeapp.enums.PresenceSource;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TodayPresenceResponse {
    private String state;
    private String checkIn;
    private String checkOut;
    private Long workedSeconds;
    private Integer todayActivities;
    private Long weekWorkedSeconds;
    private Integer punctualityRate;
    private Long utilisateurId;
    private Long entrepriseId;
    private String date;
    private String timezone;
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
    private Boolean showCheckoutAlert;
    private String overtimeStartedAt;
    private String overtimeLabel;
    private String leaveOrHolidayInfo;
    private String latestAlert;
    private String heureEntree;
    private String heureSortie;
    private PointageLocationDTO checkInLocation;
    private String checkInLocationLabel;
    private PointageLocationDTO checkOutLocation;
    private String checkOutLocationLabel;
    private PresenceSource source;
    private PresenceSessionResponse activeSession;
    private List<PresenceSessionResponse> sessions;
}
