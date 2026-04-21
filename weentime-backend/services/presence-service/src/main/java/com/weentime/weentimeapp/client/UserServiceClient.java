package com.weentime.weentimeapp.client;

import com.weentime.weentimeapp.dto.UserSummaryDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;

@FeignClient(name = "organisation-service", url = "${integration.user-service.url}")
public interface UserServiceClient {

    @GetMapping("/api/v1/organisations/internal/users/{userId}/summary")
    UserSummaryDTO getUserById(@PathVariable("userId") Long userId);

    @GetMapping("/api/v1/organisations/internal/users/{userId}/manager")
    UserSummaryDTO getManager(@PathVariable("userId") Long userId);

    @GetMapping("/api/v1/organisations/internal/users/{userId}/roles")
    java.util.List<String> getRoles(@PathVariable("userId") Long userId);

    @GetMapping("/api/v1/organisations/internal/managers/{managerId}/team")
    List<UserSummaryDTO> getTeamMembers(@PathVariable("managerId") Long managerId);

    @GetMapping("/api/v1/organisations/internal/users/active")
    List<UserSummaryDTO> getActiveUsers();
}
