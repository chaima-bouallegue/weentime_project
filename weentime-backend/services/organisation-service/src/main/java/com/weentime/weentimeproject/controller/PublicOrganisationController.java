package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import com.weentime.weentimeproject.service.EntrepriseService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/organisations")
@RequiredArgsConstructor
public class PublicOrganisationController {

    private final EntrepriseService entrepriseService;

    /**
     * Public endpoint used by the front (unauthenticated) to validate invitation codes.
     * Mirrors the behaviour of /organisations/entreprises/by-code but without requiring auth.
     */
    @GetMapping("/by-code/{code}")
    public ResponseEntity<EntrepriseResponse> getByCode(@PathVariable String code) {
        try {
            return ResponseEntity.ok(entrepriseService.getByCode(code));
        } catch (EntityNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }
}
