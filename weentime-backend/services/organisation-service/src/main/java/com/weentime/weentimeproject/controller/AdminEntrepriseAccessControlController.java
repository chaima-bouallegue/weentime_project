package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.EnterpriseAccessControlRequest;
import com.weentime.weentimeproject.dto.response.EnterpriseAccessControlResponse;
import com.weentime.weentimeproject.service.EnterpriseAccessControlService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/entreprises")
@RequiredArgsConstructor
public class AdminEntrepriseAccessControlController {

    private final EnterpriseAccessControlService enterpriseAccessControlService;

    @GetMapping("/{enterpriseId}/access-control")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EnterpriseAccessControlResponse> getEnterpriseAccessControl(
            @PathVariable Long enterpriseId
    ) {
        return ResponseEntity.ok(enterpriseAccessControlService.getEnterpriseAccessControl(enterpriseId));
    }

    @PutMapping("/{enterpriseId}/access-control")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<EnterpriseAccessControlResponse> updateEnterpriseAccessControl(
            @PathVariable Long enterpriseId,
            @Valid @RequestBody EnterpriseAccessControlRequest request
    ) {
        return ResponseEntity.ok(enterpriseAccessControlService.updateEnterpriseAccessControl(enterpriseId, request));
    }
}
