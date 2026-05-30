package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.PresenceStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

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
        private PresenceStatus status;
        private String heureEntree;
        private String heureSortie;
        private String checkInLocation;
        private PointageLocationDTO checkInLocationDetails;
        private String checkOutLocation;
        private PointageLocationDTO checkOutLocationDetails;
        private Long durationSeconds;
        private Integer overtimeMinutes;
        private String latestAlert;
        private Boolean autoClosed;
        private Boolean lateArrival;
        private Long equipeId;
        private String equipe;
        private Long entrepriseId;
        private String entreprise;
    }
}
