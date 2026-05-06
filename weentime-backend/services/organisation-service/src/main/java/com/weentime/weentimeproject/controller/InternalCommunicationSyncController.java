package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.response.CommunicationSyncEnterpriseResponse;
import com.weentime.weentimeproject.service.CommunicationInternalSyncService;
import com.weentime.weentimeproject.service.InternalServiceKeyValidator;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/organisations/internal")
@RequiredArgsConstructor
public class InternalCommunicationSyncController {

    private final CommunicationInternalSyncService communicationInternalSyncService;
    private final InternalServiceKeyValidator internalServiceKeyValidator;

    @GetMapping("/sync/enterprises/{entrepriseId}")
    public ResponseEntity<CommunicationSyncEnterpriseResponse> getEnterpriseSnapshot(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @PathVariable Long entrepriseId
    ) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return ResponseEntity.ok(communicationInternalSyncService.getEnterpriseSnapshot(entrepriseId));
    }
}
