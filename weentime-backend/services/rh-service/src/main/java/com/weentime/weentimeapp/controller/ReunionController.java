package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.security.InternalAuthUtils;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.ReunionService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/rh/reunions")
@RequiredArgsConstructor
public class ReunionController {

    private final ReunionService service;

    @Value("${weentime.internal.secret:WeenTimeInternalSecretKey2026}")
    private String internalSecret;

    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER', 'RH')")
    public ResponseEntity<ReunionDTO> create(@RequestBody ReunionCreateRequest request) {
        Long userId = SecurityUtils.getCurrentUserId();
        Long enterpriseId = SecurityUtils.getCurrentEntrepriseId();
        return ResponseEntity.ok(service.createReunion(request, userId, enterpriseId));
    }

    @GetMapping("/mes-reunions")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ReunionDTO>> getMesReunions() {
        Long userId = SecurityUtils.getCurrentUserId();
        return ResponseEntity.ok(service.getMesReunions(userId));
    }

    @GetMapping("/prochaine")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ReunionDTO> getProchaine() {
        Long userId = SecurityUtils.getCurrentUserId();
        return ResponseEntity.ok(service.getProchaine(userId));
    }

    @GetMapping("/{uuid}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ReunionDTO> getDetail(@PathVariable String uuid) {
        return ResponseEntity.ok(service.getDetail(uuid));
    }

    @PatchMapping("/{uuid}/repondre")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> repondre(@PathVariable String uuid, @RequestBody ReunionResponseRequest request) {
        Long userId = SecurityUtils.getCurrentUserId();
        service.repondre(uuid, request, userId);
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/{uuid}/cloturer")
    @PreAuthorize("hasAnyRole('MANAGER', 'RH')")
    public ResponseEntity<Void> cloturer(@PathVariable String uuid, @RequestBody ClotureReunionRequest request) {
        Long userId = SecurityUtils.getCurrentUserId();
        service.cloturer(uuid, request, userId);
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/{uuid}/annuler")
    @PreAuthorize("hasAnyRole('MANAGER', 'RH')")
    public ResponseEntity<Void> annuler(@PathVariable String uuid) {
        Long userId = SecurityUtils.getCurrentUserId();
        service.annuler(uuid, userId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/conflits")
    @PreAuthorize("hasAnyRole('MANAGER', 'RH')")
    public ResponseEntity<ConflictResponseDTO> checkConflicts(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime heureDebut,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime heureFin,
            @RequestParam String userIds) {
        
        List<Long> ids = Arrays.stream(userIds.split(","))
                .map(Long::parseLong)
                .collect(Collectors.toList());
        
        Long enterpriseId = SecurityUtils.getCurrentEntrepriseId();
        return ResponseEntity.ok(service.checkConflicts(date, heureDebut, heureFin, ids, enterpriseId));
    }

    @GetMapping("/internal/minutes-today")
    public Long getMeetingMinutesToday(
            @RequestHeader("X-Internal-Secret") String requestSecret,
            @RequestParam Long userId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        if (!InternalAuthUtils.isInternalSecretValid(requestSecret, internalSecret)) {
            throw new org.springframework.security.access.AccessDeniedException("Invalid internal secret");
        }
        return service.getMeetingMinutesToday(userId, date);
    }
    // AJOUTER ce endpoint — update partiel (description, agenda, date, heure...)
@PatchMapping("/{uuid}")
@PreAuthorize("hasAnyRole('MANAGER', 'RH')")
public ResponseEntity<ReunionDTO> update(
        @PathVariable String uuid,
        @RequestBody ReunionUpdateRequest request) {
    Long userId = SecurityUtils.getCurrentUserId();
    return ResponseEntity.ok(service.updateReunion(uuid, request, userId));
}

// AJOUTER ce endpoint — retirer un participant
@DeleteMapping("/{uuid}/participants/{participantId}")
@PreAuthorize("hasAnyRole('MANAGER', 'RH')")
public ResponseEntity<Void> removeParticipant(
        @PathVariable String uuid,
        @PathVariable Long participantId) {
    Long userId = SecurityUtils.getCurrentUserId();
    service.removeParticipant(uuid, participantId, userId);
    return ResponseEntity.ok().build();
}
}
