package com.weentime.communication.controller;

import com.weentime.communication.dto.AdminOutboxStatusResponse;
import com.weentime.communication.dto.ApiEnvelope;
import com.weentime.communication.dto.CommunicationBootstrapResponse;
import com.weentime.communication.dto.ProvisioningSyncResponse;
import com.weentime.communication.security.SecurityUtils;
import com.weentime.communication.service.CommunicationOutboxDispatcher;
import com.weentime.communication.service.CommunicationProvisioningService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/communication/admin")
@RequiredArgsConstructor
public class CommunicationAdminController {

    private final CommunicationProvisioningService provisioningService;
    private final CommunicationOutboxDispatcher outboxDispatcher;

    @PostMapping("/sync")
    public ApiEnvelope<ProvisioningSyncResponse> syncCurrentEnterprise() {
        return ApiEnvelope.success(provisioningService.syncCurrentEnterprise(SecurityUtils.currentUser()));
    }

    @PostMapping("/sync/enterprise/{entrepriseId}")
    public ApiEnvelope<ProvisioningSyncResponse> syncEnterprise(@PathVariable Long entrepriseId) {
        return ApiEnvelope.success(provisioningService.syncEnterprise(entrepriseId, SecurityUtils.currentUser()));
    }

    @PostMapping("/bootstrap")
    public ApiEnvelope<CommunicationBootstrapResponse> bootstrapCurrentEnterprise() {
        return ApiEnvelope.success(provisioningService.bootstrapCurrentEnterprise(SecurityUtils.currentUser()));
    }

    @GetMapping("/outbox/status")
    public ApiEnvelope<AdminOutboxStatusResponse> getOutboxStatus() {
        return ApiEnvelope.success(outboxDispatcher.getStatus());
    }
}
