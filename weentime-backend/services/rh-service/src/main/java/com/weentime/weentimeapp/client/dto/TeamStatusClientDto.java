package com.weentime.weentimeapp.client.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TeamStatusClientDto {
    private String scope;
    private Long teamId;
    private Long entrepriseId;
    private long totalMembers;
    private long presentMembers;
    private long workingMembers;
    private long lateMembers;
    private long absentMembers;
    private List<MemberStatusClientDto> members;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberStatusClientDto {
        private Long utilisateurId;
        private String nomComplet;
        private String status;
        private String heureEntree;
        private String heureSortie;
        private Long durationSeconds;
        private Boolean lateArrival;
        private Long equipeId;
        private String equipe;
        private Long entrepriseId;
        private String entreprise;
    }
}
