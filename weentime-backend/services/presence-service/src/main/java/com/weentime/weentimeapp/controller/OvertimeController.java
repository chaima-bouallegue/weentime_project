package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.OvertimeDTO;
import com.weentime.weentimeapp.dto.response.ApiResponse;
import com.weentime.weentimeapp.entity.Overtime;
import com.weentime.weentimeapp.enums.OvertimeStatus;
import com.weentime.weentimeapp.exception.PresenceBusinessException;
import com.weentime.weentimeapp.mapper.OvertimeMapper;
import com.weentime.weentimeapp.repository.OvertimeRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/overtime")
@RequiredArgsConstructor
public class OvertimeController {

    private final OvertimeRepository overtimeRepository;
    private final OvertimeMapper overtimeMapper;
    private final SecurityUtils securityUtils;

    @GetMapping("/me")
    @PreAuthorize("hasAnyAuthority('ROLE_EMPLOYEE','ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','EMPLOYEE','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<Page<OvertimeDTO>>> getMyOvertime(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        Long userId = securityUtils.getCurrentUserId();
        Page<OvertimeDTO> result = overtimeRepository
                .findByUtilisateurIdOrderByDateDesc(userId, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)))
                .map(overtimeMapper::toDto);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/pending")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<Page<OvertimeDTO>>> getPendingOvertime(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        PageRequest pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        Long entrepriseId = securityUtils.getCurrentEntrepriseId();
        Page<Overtime> pending = entrepriseId == null
                ? overtimeRepository.findByStatusOrderByDateDesc(OvertimeStatus.PENDING_APPROVAL, pageable)
                : overtimeRepository.findByEntrepriseIdAndStatusOrderByDateDesc(entrepriseId, OvertimeStatus.PENDING_APPROVAL, pageable);
        return ResponseEntity.ok(ApiResponse.success(pending.map(overtimeMapper::toDto)));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> approve(@PathVariable Long id) {
        Overtime overtime = findOvertime(id);
        overtime.setStatus(OvertimeStatus.APPROVED);
        overtime.setApprouvee(Boolean.TRUE);
        overtime.setRhDecisionBy(securityUtils.getCurrentUserId());
        return ResponseEntity.ok(ApiResponse.success(overtimeMapper.toDto(overtimeRepository.save(overtime))));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> reject(@PathVariable Long id, @RequestBody(required = false) RejectOvertimeRequest request) {
        Overtime overtime = findOvertime(id);
        overtime.setStatus(OvertimeStatus.REJECTED);
        overtime.setApprouvee(Boolean.FALSE);
        overtime.setRhDecisionBy(securityUtils.getCurrentUserId());
        if (request != null && request.getReason() != null && !request.getReason().isBlank()) {
            overtime.setReason(request.getReason().trim());
        }
        return ResponseEntity.ok(ApiResponse.success(overtimeMapper.toDto(overtimeRepository.save(overtime))));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        long pending = overtimeRepository.count();
        BigDecimal total = overtimeRepository.sumHeuresSupplementairesBetween(java.time.LocalDate.now().minusMonths(1), java.time.LocalDate.now());
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "totalRequests", pending,
                "hoursLast30Days", total
        )));
    }

    private Overtime findOvertime(Long id) {
        return overtimeRepository.findById(id)
                .orElseThrow(() -> new PresenceBusinessException(HttpStatus.NOT_FOUND, "OVERTIME_NOT_FOUND", "Demande d'heures supplementaires introuvable."));
    }

    @Data
    public static class RejectOvertimeRequest {
        private String reason;
    }
}
