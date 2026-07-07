package com.weentime.weentimeapp.client;

import com.weentime.weentimeapp.dto.UserSummaryResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.Collection;
import java.util.List;

@FeignClient(
        name = "organisation-internal-client",
        contextId = "organisationInternalClient",
        url = "${ORGANISATION_SERVICE_URL:http://${ORGANISATION_SERVICE_HOST:localhost}:${ORGANISATION_SERVICE_PORT:8190}}"
)
public interface OrganisationInternalClient {

    @PostMapping("/api/v1/organisations/internal/users/summaries")
    List<UserSummaryResponse> getUserSummaries(@RequestBody Collection<Long> ids);
}
