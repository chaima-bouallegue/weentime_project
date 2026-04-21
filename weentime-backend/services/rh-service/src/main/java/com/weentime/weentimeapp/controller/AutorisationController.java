package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.AutorisationDTO;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.dto.StatsAutorisationDTO;
import com.weentime.weentimeapp.service.AutorisationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/rh/autorisations")
@RequiredArgsConstructor
public class AutorisationController {

    private final AutorisationService service;

    private String getCurrentUserEmail() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    @PostMapping
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<AutorisationDTO> create(@RequestBody AutorisationDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(dto, getCurrentUserEmail()));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<PageResponse<AutorisationDTO>> getAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && hasRole(authentication, "ROLE_RH")) {
            return ResponseEntity.ok(service.getRhHistory(getCurrentUserEmail(), page, size));
        }
        if (authentication != null && hasRole(authentication, "ROLE_MANAGER")) {
            return ResponseEntity.ok(service.getManagerHistory(getCurrentUserEmail(), page, size));
        }
        return ResponseEntity.ok(service.getEmployeeHistory(getCurrentUserEmail(), page, size));
    }

    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<PageResponse<AutorisationDTO>> getMine(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ResponseEntity.ok(service.getEmployeeHistory(getCurrentUserEmail(), page, size));
    }

    @GetMapping("/manager")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<PageResponse<AutorisationDTO>> getManagerDemandes(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ResponseEntity.ok(service.getManagerHistory(getCurrentUserEmail(), page, size));
    }

    @GetMapping("/my-history")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<PageResponse<AutorisationDTO>> getMyHistory(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ResponseEntity.ok(service.getEmployeeHistory(getCurrentUserEmail(), page, size));
    }

    @GetMapping("/manager/history")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<PageResponse<AutorisationDTO>> getManagerHistory(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ResponseEntity.ok(service.getManagerHistory(getCurrentUserEmail(), page, size));
    }

    @GetMapping("/rh/history")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<PageResponse<AutorisationDTO>> getRhHistory(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ResponseEntity.ok(service.getRhHistory(getCurrentUserEmail(), page, size));
    }

    @GetMapping("/kpis/employee")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<StatsAutorisationDTO> getEmployeeKPIs() {
        return ResponseEntity.ok(service.getEmployeeKPIs(getCurrentUserEmail()));
    }

    @GetMapping("/kpis/manager")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<StatsAutorisationDTO> getManagerKPIs() {
        return ResponseEntity.ok(service.getManagerKPIs(getCurrentUserEmail()));
    }

    @GetMapping("/kpis/rh")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<StatsAutorisationDTO> getRhKPIs() {
        return ResponseEntity.ok(service.getRhKPIs(getCurrentUserEmail()));
    }

    @PatchMapping({"/{id}/manager/validate", "/{id}/validate/manager"})
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<AutorisationDTO> validateManager(@PathVariable Long id) {
        return ResponseEntity.ok(service.validateManager(id, getCurrentUserEmail()));
    }

    @PatchMapping({"/{id}/rh/validate", "/{id}/validate/rh"})
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<AutorisationDTO> validateRH(@PathVariable Long id) {
        return ResponseEntity.ok(service.validateRH(id, getCurrentUserEmail()));
    }

    @PatchMapping({"/{id}/reject", "/{id}/refuser"})
    @PreAuthorize("hasAnyRole('MANAGER', 'RH')")
    public ResponseEntity<AutorisationDTO> reject(
            @PathVariable Long id,
            @RequestBody(required = false) java.util.Map<String, String> body,
            @RequestParam(required = false) String commentaire
    ) {
        String resolvedComment = commentaire;
        if ((resolvedComment == null || resolvedComment.isBlank()) && body != null) {
            resolvedComment = body.get("commentaire");
        }
        return ResponseEntity.ok(service.reject(id, getCurrentUserEmail(), resolvedComment));
    }

    @PatchMapping("/{id}/cancel")
    @PreAuthorize("hasRole('EMPLOYEE')")
    public ResponseEntity<AutorisationDTO> cancel(@PathVariable Long id) {
        return ResponseEntity.ok(service.cancel(id, getCurrentUserEmail()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('EMPLOYEE','MANAGER','RH')")
    public ResponseEntity<AutorisationDTO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    private boolean hasRole(Authentication authentication, String role) {
        return authentication.getAuthorities().stream().anyMatch(authority -> role.equals(authority.getAuthority()));
    }
}
