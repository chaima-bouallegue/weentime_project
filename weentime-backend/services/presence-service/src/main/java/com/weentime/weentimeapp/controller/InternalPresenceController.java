package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.config.InternalAuthValidator;
import com.weentime.weentimeapp.dto.PresenceStatsDTO;
import com.weentime.weentimeapp.dto.TeamStatusResponse;
import com.weentime.weentimeapp.dto.response.ApiResponse;
import com.weentime.weentimeapp.service.PresenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/presence/internal")
@RequiredArgsConstructor
public class InternalPresenceController {

    private final PresenceService presenceService;
    private final InternalAuthValidator internalAuthValidator;

    @GetMapping("/company/{rhUserId}/today")
    public ResponseEntity<ApiResponse<TeamStatusResponse>> getCompanyToday(
            @RequestHeader("X-Internal-Secret") String internalSecret,
            @PathVariable Long rhUserId) {
        internalAuthValidator.assertValid(internalSecret);
        return ResponseEntity.ok(ApiResponse.success(presenceService.getCompanyTodayStatus(rhUserId)));
    }

    @GetMapping("/company/{rhUserId}/stats")
    public ResponseEntity<ApiResponse<PresenceStatsDTO>> getCompanyStats(
            @RequestHeader("X-Internal-Secret") String internalSecret,
            @PathVariable Long rhUserId) {
        internalAuthValidator.assertValid(internalSecret);
        return ResponseEntity.ok(ApiResponse.success(presenceService.getCompanyStats(rhUserId)));
    }
}
