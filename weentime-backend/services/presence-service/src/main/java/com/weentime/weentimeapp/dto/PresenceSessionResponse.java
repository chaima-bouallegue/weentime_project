package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.AttendanceSessionStatus;
import com.weentime.weentimeapp.enums.OvertimeMode;
import com.weentime.weentimeapp.enums.PresenceSource;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresenceSessionResponse {
    private Long id;
    private Long utilisateurId;
    private Long entrepriseId;
    private Long scheduleId;
    private String date;
    private String checkInTime;
    private String checkOutTime;
    private Long duration;
    private AttendanceSessionStatus status;
    private PresenceSource source;
    private PresenceSource checkInSource;
    private PresenceSource checkOutSource;
    private String localisation;
    private Double checkInLatitude;
    private Double checkInLongitude;
    private Double checkInAccuracy;
    private String checkInAddress;
    private String checkInCity;
    private String checkInRegion;
    private String checkInCountry;
    private PointageLocationDTO checkInLocation;
    private String checkInLocationLabel;
    private Double checkOutLatitude;
    private Double checkOutLongitude;
    private Double checkOutAccuracy;
    private String checkOutAddress;
    private String checkOutCity;
    private String checkOutRegion;
    private String checkOutCountry;
    private PointageLocationDTO checkOutLocation;
    private String checkOutLocationLabel;
    private Boolean lateArrival;
    private AttendanceDayStatus dailyStatus;
    private Integer workedMinutes;
    private Integer expectedMinutes;
    private Integer overtimeMinutes;
    private OvertimeMode overtimeMode;
    private String overtimeStartedAt;
    private String overtimeConfirmedAt;
    private String overtimeConfirmationShownAt;
    private Integer earlyLeaveMinutes;
    private Boolean autoClosed;
    private String autoClosedReason;
    private String latestAlert;
    private String createdAt;
}
