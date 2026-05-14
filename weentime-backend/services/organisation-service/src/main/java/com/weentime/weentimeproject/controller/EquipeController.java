package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.EquipeRequest;
import com.weentime.weentimeproject.dto.response.EquipeResponse;
import com.weentime.weentimeproject.pagination.PageParams;
import com.weentime.weentimeproject.service.EquipeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/organisations/equipes")
@RequiredArgsConstructor
public class EquipeController {

    private final EquipeService equipeService;

    @PostMapping
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_RH')")
    public ResponseEntity<EquipeResponse> createEquipe(
            @Valid @RequestBody EquipeRequest request) {
        return new ResponseEntity<>(equipeService.createEquipe(request), HttpStatus.CREATED);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_RH') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<EquipeResponse> getEquipeById(
            @PathVariable Long id) {
        return ResponseEntity.ok(equipeService.getEquipeById(id));
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_RH', 'ROLE_MANAGER')")
    public ResponseEntity<Page<EquipeResponse>> getAllEquipes(
            @Valid PageParams params) {
        return ResponseEntity.ok(equipeService.getAllEquipes(params.toPageable()));
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_RH')")
    public ResponseEntity<EquipeResponse> updateEquipe(
            @PathVariable Long id,
            @Valid @RequestBody EquipeRequest request) {
        return ResponseEntity.ok(equipeService.updateEquipe(id, request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_RH')")
    public ResponseEntity<EquipeResponse> replaceEquipe(
            @PathVariable Long id,
            @Valid @RequestBody EquipeRequest request) {
        return updateEquipe(id, request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_RH')")
    public ResponseEntity<Void> deleteEquipe(@PathVariable Long id) {
        equipeService.deleteEquipe(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/members")
    @PreAuthorize("hasAuthority('ROLE_RH') or hasAuthority('ROLE_MANAGER') or hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Page<?>> getEquipeMembers(
            @PathVariable Long id,
            @Valid PageParams params) {
        return ResponseEntity.ok(equipeService.getEquipeMembers(id, params.toPageable()));
    }

    @GetMapping("/responsable/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_RH') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<java.util.List<EquipeResponse>> getEquipesByResponsable(
            @PathVariable Long id) {
        return ResponseEntity.ok(equipeService.getEquipesByResponsable(id));
    }
}
