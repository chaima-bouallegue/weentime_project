package com.weentime.weentimeapp.client;

import com.weentime.weentimeapp.dto.EntrepriseResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@FeignClient(name = "organisation-service", 
             contextId = "entrepriseServiceClient",
             url = "${ORGANISATION_SERVICE_URL:http://${ORGANISATION_SERVICE_HOST:localhost}:${ORGANISATION_SERVICE_PORT:8190}}", 
             path = "/api/v1/organisations/entreprises")
public interface EntrepriseServiceClient {

    @GetMapping("/{id}")
    EntrepriseResponse getEntrepriseById(@PathVariable("id") Long id);
}
