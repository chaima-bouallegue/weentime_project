package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.PresenceStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TeamStatusResponse {
    private String scope;
    private Long teamId;
    private Long entrepriseId;
    private long totalMembers;
    private long presentMembers;
    private long workingMembers;
    private long lateMembers;
    private long absentMembers;
    private List<MemberStatus> members;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberStatus {
        private Long utilisateurId;
        private String nomComplet;
        private LocalDate date;
        private PresenceStatus status;
        private String heureEntree;
        private String heureSortie;
        private String checkInLocation;
        private PointageLocationDTO checkInLocationDetails;
        private String checkOutLocation;
        private PointageLocationDTO checkOutLocationDetails;
        private Long durationSeconds;
        private Integer workedMinutes;
        private Integer expectedMinutes;
        private String scheduledStart;
        private String scheduledEnd;
        private Boolean scheduledWorkday;
        private Boolean approvedLeave;
        private Boolean approvedTelework;
        private Boolean holiday;
        private Integer overtimeMinutes;
        private String latestAlert;
        private Boolean autoClosed;
        private Boolean lateArrival;
        private Long managerId;
        private Long equipeId;
        private String equipe;
        private Long entrepriseId;
        private String entreprise;
    }
}
