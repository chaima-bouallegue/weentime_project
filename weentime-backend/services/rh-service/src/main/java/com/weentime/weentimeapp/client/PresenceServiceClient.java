package com.weentime.weentimeapp.client;

import com.weentime.weentimeapp.client.dto.PresenceStatsClientDto;
import com.weentime.weentimeapp.client.dto.TeamStatusClientDto;
import com.weentime.weentimeapp.dto.ApiResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

@FeignClient(name = "presence-service", url = "http://localhost:8093")
public interface PresenceServiceClient {

    @GetMapping("/api/v1/presence/company/today")
    ApiResponse<TeamStatusClientDto> getCompanyToday();

    @GetMapping("/api/v1/presence/company/stats")
    ApiResponse<PresenceStatsClientDto> getCompanyStats();
}
