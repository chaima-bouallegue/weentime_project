package com.weentime.communication.service;

import com.weentime.communication.dto.InternalNotificationDispatchRequest;
import com.weentime.communication.dto.OrganisationEnterpriseSyncSnapshot;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "organisationInternalOperationsClient", url = "${integration.organisation-service.url}")
public interface OrganisationInternalOperationsClient {

    @GetMapping("/api/v1/organisations/internal/sync/enterprises/{entrepriseId}")
    OrganisationEnterpriseSyncSnapshot getEnterpriseSyncSnapshot(
            @RequestHeader("X-Internal-Service-Key") String internalApiKey,
            @PathVariable("entrepriseId") Long entrepriseId
    );

    @PostMapping("/api/v1/organisations/internal/notifications/users/{userId}")
    Object sendNotification(
            @RequestHeader("X-Internal-Service-Key") String internalApiKey,
            @PathVariable("userId") Long userId,
            @RequestBody InternalNotificationDispatchRequest request
    );
}
