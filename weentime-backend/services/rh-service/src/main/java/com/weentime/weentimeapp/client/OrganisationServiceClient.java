package com.weentime.weentimeapp.client;

import com.weentime.weentimeapp.dto.UserResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@FeignClient(name = "organisation-service", url = "${ORGANISATION_SERVICE_URL:http://${ORGANISATION_SERVICE_HOST:localhost}:${ORGANISATION_SERVICE_PORT:8190}}", path = "/api/v1/organisations/users")
public interface OrganisationServiceClient {

    @GetMapping("/{id}")
    UserResponse getUtilisateurById(@PathVariable("id") Long id);

    @GetMapping("/auth/by-email")
    com.weentime.weentimeapp.dto.UtilisateurAuthResponse getUtilisateurForAuth(@org.springframework.web.bind.annotation.RequestParam("email") String email);

    @GetMapping("/entreprise/{entrepriseId}/ids")
    java.util.List<Long> findUserIdsByEntrepriseId(@PathVariable("entrepriseId") Long entrepriseId);

    @GetMapping("/entreprise/{entrepriseId}")
    java.util.List<UserResponse> findUsersByEntreprise(@PathVariable("entrepriseId") Long entrepriseId);

    @GetMapping("/entreprise/{entrepriseId}/role/{role}/ids")
    java.util.List<Long> findUserIdsByEntrepriseAndRole(
            @PathVariable("entrepriseId") Long entrepriseId,
            @PathVariable("role") String role);
}
