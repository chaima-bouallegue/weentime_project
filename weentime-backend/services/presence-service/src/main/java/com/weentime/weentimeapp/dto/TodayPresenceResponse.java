package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.AttendanceDayStatus;
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
    private String date;
    private String timezone;
    private AttendanceDayStatus status;
    private Boolean lateArrival;
    private Boolean hasOpenSession;
    private Long totalDuration;
    private String heureEntree;
    private String heureSortie;
    private PresenceSource source;
    private PresenceSessionResponse activeSession;
    private List<PresenceSessionResponse> sessions;
}
