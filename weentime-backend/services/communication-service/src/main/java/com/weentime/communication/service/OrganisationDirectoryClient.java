package com.weentime.communication.service;

import com.weentime.communication.dto.OrganisationUserSummary;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

import java.util.Collection;
import java.util.List;

@FeignClient(name = "organisationDirectoryClient", url = "${integration.organisation-service.url}")
public interface OrganisationDirectoryClient {

    @GetMapping("/api/v1/organisations/internal/users/{id}/summary")
    OrganisationUserSummary getUserSummary(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable("id") Long id
    );

    @PostMapping("/api/v1/organisations/internal/users/summaries")
    List<OrganisationUserSummary> getUserSummaries(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestBody Collection<Long> ids
    );
}
