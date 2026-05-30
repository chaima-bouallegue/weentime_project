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
public class AttendanceSessionDTO {
    private Long id;
    private Long utilisateurId;
    private Long entrepriseId;
    private Long scheduleId;
    private LocalDate date;
    private LocalDateTime checkInTime;
    private LocalDateTime checkOutTime;
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
    private String checkInLocation;
    private PointageLocationDTO checkInLocationDetails;
    private Double checkOutLatitude;
    private Double checkOutLongitude;
    private Double checkOutAccuracy;
    private String checkOutAddress;
    private String checkOutCity;
    private String checkOutRegion;
    private String checkOutCountry;
    private String checkOutLocation;
    private PointageLocationDTO checkOutLocationDetails;
    private Boolean lateArrival;
    private AttendanceDayStatus dailyStatus;
    private Integer workedMinutes;
    private Integer expectedMinutes;
    private Integer overtimeMinutes;
    private Integer earlyLeaveMinutes;
    private Boolean autoClosed;
    private String autoClosedReason;
    private String latestAlert;
    private LocalDateTime createdAt;
}
