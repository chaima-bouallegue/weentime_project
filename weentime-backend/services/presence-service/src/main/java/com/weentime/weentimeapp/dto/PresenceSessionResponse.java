package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.AttendanceDayStatus;
import com.weentime.weentimeapp.enums.AttendanceSessionStatus;
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
    private String date;
    private String checkInTime;
    private String checkOutTime;
    private Long duration;
    private AttendanceSessionStatus status;
    private PresenceSource source;
    private String localisation;
    private Boolean lateArrival;
    private AttendanceDayStatus dailyStatus;
    private String createdAt;
}
