package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.horaire.AffectationHoraireDto;
import com.weentime.weentimeapp.dto.horaire.AssignHoraireBatchRequestDto;
import com.weentime.weentimeapp.dto.horaire.AssignHoraireRequestDto;
import com.weentime.weentimeapp.dto.horaire.CheckChevauchementResponseDto;
import com.weentime.weentimeapp.dto.horaire.EmployeeScheduleDto;
import com.weentime.weentimeapp.dto.horaire.HoraireDto;
import com.weentime.weentimeapp.dto.response.ApiResponse;
import com.weentime.weentimeapp.enums.CibleType;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.HoraireManagementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/horaires")
@RequiredArgsConstructor
public class HoraireController {

    private final HoraireManagementService horaireManagementService;
    private final SecurityUtils securityUtils;

    @GetMapping
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Page<HoraireDto>>> getHoraires(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.getHoraires(securityUtils.getCurrentUserId(), pageable)
        ));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<HoraireDto>> getHoraireById(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.getHoraireById(securityUtils.getCurrentUserId(), id)
        ));
    }

    @PostMapping
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<HoraireDto>> createHoraire(@Valid @RequestBody HoraireDto request) {
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.createHoraire(securityUtils.getCurrentUserId(), request)
        ));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<HoraireDto>> updateHoraire(@PathVariable Long id, @Valid @RequestBody HoraireDto request) {
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.updateHoraire(securityUtils.getCurrentUserId(), id, request)
        ));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<Void> deleteHoraire(@PathVariable Long id) {
        horaireManagementService.deleteHoraire(securityUtils.getCurrentUserId(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/assign")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<AffectationHoraireDto>> assignHoraire(@Valid @RequestBody AssignHoraireRequestDto request) {
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.assignHoraire(securityUtils.getCurrentUserId(), request)
        ));
    }

    @PostMapping("/assign/batch")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<List<AffectationHoraireDto>>> assignHoraireBatch(
            @Valid @RequestBody AssignHoraireBatchRequestDto request
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.assignHoraireBatch(securityUtils.getCurrentUserId(), request)
        ));
    }

    @GetMapping("/assign")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Page<AffectationHoraireDto>>> getAffectations(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.getAffectations(securityUtils.getCurrentUserId(), pageable)
        ));
    }

    @DeleteMapping("/assign/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<Void> deleteAffectation(@PathVariable Long id) {
        horaireManagementService.deleteAffectation(securityUtils.getCurrentUserId(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/assign/check-chevauchement")
    @PreAuthorize("hasAnyAuthority('ROLE_RH', 'ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<CheckChevauchementResponseDto>> checkChevauchement(
            @RequestParam CibleType cibleType,
            @RequestParam Long cibleId,
            @RequestParam Integer priorite,
            @RequestParam LocalDate dateDebut,
            @RequestParam(required = false) LocalDate dateFin
    ) {
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.checkChevauchement(
                        securityUtils.getCurrentUserId(),
                        cibleType,
                        cibleId,
                        priorite,
                        dateDebut,
                        dateFin
                )
        ));
    }

    @GetMapping("/resolve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<HoraireDto>> resolveHoraire(@RequestParam(required = false) String email) {
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.resolveHoraire(securityUtils.getCurrentUserId(), email)
        ));
    }

    @GetMapping("/team")
    @PreAuthorize("hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<List<EmployeeScheduleDto>>> getTeamSchedules() {
        return ResponseEntity.ok(ApiResponse.success(
                horaireManagementService.getTeamSchedules(securityUtils.getCurrentUserId())
        ));
    }
}
