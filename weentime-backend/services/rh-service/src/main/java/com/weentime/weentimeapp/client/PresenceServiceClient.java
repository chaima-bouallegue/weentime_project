package com.weentime.weentimeapp.client;

import com.weentime.weentimeapp.client.dto.PresenceStatsClientDto;
import com.weentime.weentimeapp.client.dto.TeamStatusClientDto;
import com.weentime.weentimeapp.dto.ApiResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@FeignClient(name = "presence-service", url = "${application.config.presence-url:http://localhost:8093}")
public interface PresenceServiceClient {

    @GetMapping("/api/v1/presence/company/today")
    ApiResponse<TeamStatusClientDto> getCompanyToday();

    @GetMapping("/api/v1/presence/company/stats")
    ApiResponse<PresenceStatsClientDto> getCompanyStats();

    @GetMapping("/api/v1/presences/pointages/enterprise/status-range")
    Map<LocalDate, PresenceResponse> getStatusRange(
            @RequestParam("entrepriseId") Long entrepriseId,
            @RequestParam(value = "equipeId", required = false) Long equipeId,
            @RequestParam("start") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam("end") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end);

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    class PresenceResponse {
        private List<MemberStatus> members;
        private Kpis kpis;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    class MemberStatus {
        private Long utilisateurId;
        private String nomComplet;
        private String avatar;
        private String jobTitle;
        private String status;
        private String heureEntree;
        private String heureSortie;
        private long totalMinutes;
        private long overtimeMinutes;
        private String lastActivity;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    class Kpis {
        private int totalMembers;
        private int presentCount;
        private int lateCount;
        private int absentCount;
        private double averagePunctuality;
    }
}
