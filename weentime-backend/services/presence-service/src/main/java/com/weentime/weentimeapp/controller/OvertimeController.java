package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.UserServiceClient;
import com.weentime.weentimeapp.dto.OvertimeDTO;
import com.weentime.weentimeapp.dto.UserSummaryDTO;
import com.weentime.weentimeapp.dto.response.ApiResponse;
import com.weentime.weentimeapp.entity.Overtime;
import com.weentime.weentimeapp.enums.OvertimeStatus;
import com.weentime.weentimeapp.exception.PresenceBusinessException;
import com.weentime.weentimeapp.mapper.OvertimeMapper;
import com.weentime.weentimeapp.repository.OvertimeRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/overtime")
@RequiredArgsConstructor
@Slf4j
public class OvertimeController {

    private static final Set<OvertimeStatus> PENDING_STATUSES = Set.of(
            OvertimeStatus.PENDING_MANAGER,
            OvertimeStatus.PENDING_RH,
            OvertimeStatus.EN_ATTENTE_MANAGER,
            OvertimeStatus.EN_ATTENTE_RH,
            OvertimeStatus.PENDING_APPROVAL
    );
    private static final Set<OvertimeStatus> MANAGER_PENDING_STATUSES = Set.of(
            OvertimeStatus.PENDING_MANAGER,
            OvertimeStatus.EN_ATTENTE_MANAGER,
            OvertimeStatus.PENDING_APPROVAL
    );
    private static final Set<OvertimeStatus> RH_PENDING_STATUSES = Set.of(
            OvertimeStatus.PENDING_RH,
            OvertimeStatus.APPROVED_MANAGER,
            OvertimeStatus.EN_ATTENTE_RH,
            OvertimeStatus.APPROUVEE_MANAGER
    );
    private static final Set<OvertimeStatus> APPROVED_STATUSES = Set.of(
            OvertimeStatus.APPROVED_MANAGER,
            OvertimeStatus.APPROVED_RH,
            OvertimeStatus.APPROUVEE_MANAGER,
            OvertimeStatus.APPROUVEE_RH,
            OvertimeStatus.APPROVED
    );
    private static final Set<OvertimeStatus> REJECTED_STATUSES = Set.of(
            OvertimeStatus.REJECTED_MANAGER,
            OvertimeStatus.REJECTED_RH,
            OvertimeStatus.REFUSEE_MANAGER,
            OvertimeStatus.REFUSEE_RH,
            OvertimeStatus.REJECTED
    );

    private final OvertimeRepository overtimeRepository;
    private final OvertimeMapper overtimeMapper;
    private final SecurityUtils securityUtils;
    private final UserServiceClient userServiceClient;

    @GetMapping("/me")
    @PreAuthorize("hasAnyAuthority('ROLE_EMPLOYEE','ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','EMPLOYEE','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<Page<OvertimeDTO>>> getMyOvertime(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        Long userId = requireCurrentUser();
        Page<OvertimeDTO> result = overtimeRepository
                .findByUtilisateurIdOrderByDateDesc(userId, pageRequest(page, size))
                .map(overtimeMapper::toDto);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/me/monthly-summary")
    @PreAuthorize("hasAnyAuthority('ROLE_EMPLOYEE','ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','EMPLOYEE','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getMyMonthlySummary(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        Long userId = requireCurrentUser();
        YearMonth period = resolvePeriod(year, month);
        LocalDate from = period.atDay(1);
        LocalDate to = period.atEndOfMonth();
        Long totalMinutes = overtimeRepository.sumOvertimeMinutesByUtilisateurIdAndDateBetween(userId, from, to);
        BigDecimal hours = BigDecimal.valueOf(totalMinutes == null ? 0L : totalMinutes)
                .divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "year", period.getYear(),
                "month", period.getMonthValue(),
                "totalMinutes", totalMinutes == null ? 0L : totalMinutes,
                "totalHours", hours,
                "requestCount", overtimeRepository.countByUtilisateurIdAndDateBetween(userId, from, to)
        )));
    }

    @PostMapping("/{id}/reason")
    @PreAuthorize("hasAnyAuthority('ROLE_EMPLOYEE','ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','EMPLOYEE','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> addReason(@PathVariable Long id, @RequestBody ReasonRequest request) {
        Overtime overtime = findOvertime(id);
        Long userId = requireCurrentUser();
        if (!Objects.equals(overtime.getUtilisateurId(), userId)) {
            throw new PresenceBusinessException(HttpStatus.FORBIDDEN, "OVERTIME_FORBIDDEN", "Vous ne pouvez modifier que vos propres heures supplementaires.");
        }
        if (request == null || request.getReason() == null || request.getReason().isBlank()) {
            throw new PresenceBusinessException(HttpStatus.BAD_REQUEST, "OVERTIME_REASON_REQUIRED", "Justification requise.");
        }
        overtime.setReason(request.getReason().trim());
        return ResponseEntity.ok(ApiResponse.success(overtimeMapper.toDto(overtimeRepository.save(overtime))));
    }

    @GetMapping({"/manager/pending", "/pending"})
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<Page<OvertimeDTO>>> getPendingOvertime(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        Long entrepriseId = securityUtils.getCurrentEntrepriseId();
        PageRequest pageable = pageRequest(page, size);
        Page<Overtime> pending;
        if (isManagerOnly()) {
            pending = overtimeRepository.findByManagerIdAndStatusInOrderByDateDesc(requireCurrentUser(), MANAGER_PENDING_STATUSES, pageable);
        } else {
            pending = entrepriseId == null
                    ? overtimeRepository.findByStatusInOrderByDateDesc(MANAGER_PENDING_STATUSES, pageable)
                    : overtimeRepository.findByEntrepriseIdAndStatusInOrderByDateDesc(entrepriseId, MANAGER_PENDING_STATUSES, pageable);
        }
        return ResponseEntity.ok(ApiResponse.success(pending.map(overtimeMapper::toDto)));
    }

    @GetMapping("/rh/pending")
    @PreAuthorize("hasAnyAuthority('ROLE_RH','ROLE_ADMIN','RH','ADMIN')")
    public ResponseEntity<ApiResponse<Page<OvertimeDTO>>> getRhPending(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        Long entrepriseId = securityUtils.getCurrentEntrepriseId();
        Page<Overtime> pending = entrepriseId == null
                ? overtimeRepository.findByStatusInOrderByDateDesc(RH_PENDING_STATUSES, pageRequest(page, size))
                : overtimeRepository.findByEntrepriseIdAndStatusInOrderByDateDesc(entrepriseId, RH_PENDING_STATUSES, pageRequest(page, size));
        return ResponseEntity.ok(ApiResponse.success(pending.map(overtimeMapper::toDto)));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> approve(@PathVariable Long id, @RequestBody(required = false) DecisionRequest request) {
        return managerDecision(id, DecisionRequest.approved(request));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> reject(@PathVariable Long id, @RequestBody(required = false) DecisionRequest request) {
        return managerDecision(id, DecisionRequest.rejected(request));
    }

    @PostMapping("/{id}/request-justification")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_RH','ROLE_ADMIN','MANAGER','RH','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> requestJustification(@PathVariable Long id, @RequestBody(required = false) DecisionRequest request) {
        Overtime overtime = findScopedOvertime(id);
        overtime.setStatus(OvertimeStatus.PENDING_MANAGER);
        overtime.setManagerId(currentReviewer());
        overtime.setManagerComment(resolveComment(request));
        setReview(overtime);
        applyDecisionComment(overtime, request);
        return ResponseEntity.ok(ApiResponse.success(overtimeMapper.toDto(overtimeRepository.save(overtime))));
    }

    @PatchMapping("/{id}/manager-decision")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_ADMIN','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> managerDecision(@PathVariable Long id, @RequestBody DecisionRequest request) {
        Overtime overtime = findManagerScopedOvertime(id);
        String decision = requireDecision(request);
        overtime.setManagerId(currentReviewer());
        overtime.setManagerDecision(decision);
        overtime.setManagerComment(resolveComment(request));
        overtime.setReviewedBy(currentReviewer());
        overtime.setReviewedAt(LocalDateTime.now());
        if ("APPROVED".equals(decision)) {
            overtime.setStatus(OvertimeStatus.PENDING_RH);
            overtime.setApprouvee(Boolean.FALSE);
        } else {
            overtime.setStatus(OvertimeStatus.REJECTED_MANAGER);
            overtime.setApprouvee(Boolean.FALSE);
        }
        return ResponseEntity.ok(ApiResponse.success(overtimeMapper.toDto(overtimeRepository.save(overtime))));
    }

    @GetMapping("/rh/all")
    @PreAuthorize("hasAnyAuthority('ROLE_RH','ROLE_ADMIN','RH','ADMIN')")
    public ResponseEntity<ApiResponse<Page<OvertimeDTO>>> getRhAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        Long entrepriseId = securityUtils.getCurrentEntrepriseId();
        Page<Overtime> result = entrepriseId == null
                ? overtimeRepository.findAll(pageRequest(page, size))
                : overtimeRepository.findByEntrepriseIdOrderByDateDesc(entrepriseId, pageRequest(page, size));
        return ResponseEntity.ok(ApiResponse.success(result.map(overtimeMapper::toDto)));
    }

    @GetMapping({"/rh/stats", "/stats"})
    @PreAuthorize("hasAnyAuthority('ROLE_RH','ROLE_ADMIN','MANAGER','RH','ADMIN','ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        YearMonth period = resolvePeriod(year, month);
        LocalDate from = period.atDay(1);
        LocalDate to = period.atEndOfMonth();
        Long entrepriseId = securityUtils.getCurrentEntrepriseId();
        Long totalMinutes = overtimeRepository.sumOvertimeMinutesByEntrepriseAndDateBetween(entrepriseId, from, to);
        long pending = countByStatuses(entrepriseId, PENDING_STATUSES);
        long approved = countByStatuses(entrepriseId, APPROVED_STATUSES);
        long rejected = countByStatuses(entrepriseId, REJECTED_STATUSES);
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "year", period.getYear(),
                "month", period.getMonthValue(),
                "totalOvertimeMinutes", totalMinutes == null ? 0L : totalMinutes,
                "totalOvertimeHours", BigDecimal.valueOf(totalMinutes == null ? 0L : totalMinutes).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP),
                "pendingOvertime", pending,
                "approvedOvertime", approved,
                "rejectedOvertime", rejected,
                "totalRequests", pending + approved + rejected
        )));
    }

    @GetMapping("/rh/by-department")
    @PreAuthorize("hasAnyAuthority('ROLE_RH','ROLE_ADMIN','RH','ADMIN')")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getByDepartment(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        YearMonth period = resolvePeriod(year, month);
        LocalDate from = period.atDay(1);
        LocalDate to = period.atEndOfMonth();
        Long entrepriseId = securityUtils.getCurrentEntrepriseId();
        List<Overtime> rows = entrepriseId == null
                ? overtimeRepository.findByDateBetweenOrderByDateDesc(from, to)
                : overtimeRepository.findByEntrepriseIdAndDateBetweenOrderByDateDesc(entrepriseId, from, to);
        Map<Long, UserSummaryDTO> users = loadUsersById(rows);
        Map<String, Integer> byDepartment = new LinkedHashMap<>();
        for (Overtime overtime : rows) {
            UserSummaryDTO user = users.get(overtime.getUtilisateurId());
            String department = user != null && user.getDepartement() != null && !user.getDepartement().isBlank()
                    ? user.getDepartement()
                    : "Non renseigne";
            byDepartment.merge(department, Math.max(overtime.getOvertimeMinutes() == null ? 0 : overtime.getOvertimeMinutes(), 0), Integer::sum);
        }
        List<Map<String, Object>> payload = byDepartment.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .map(entry -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("department", entry.getKey());
                    item.put("overtimeMinutes", entry.getValue());
                    item.put("overtimeHours", BigDecimal.valueOf(entry.getValue()).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP));
                    return item;
                })
                .toList();
        return ResponseEntity.ok(ApiResponse.success(payload));
    }

    @PostMapping("/{id}/rh-approve")
    @PreAuthorize("hasAnyAuthority('ROLE_RH','ROLE_ADMIN','RH','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> rhApprove(@PathVariable Long id, @RequestBody(required = false) DecisionRequest request) {
        return rhDecision(id, DecisionRequest.approved(request));
    }

    @PostMapping("/{id}/rh-reject")
    @PreAuthorize("hasAnyAuthority('ROLE_RH','ROLE_ADMIN','RH','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> rhReject(@PathVariable Long id, @RequestBody(required = false) DecisionRequest request) {
        return rhDecision(id, DecisionRequest.rejected(request));
    }

    @PatchMapping("/{id}/rh-decision")
    @PreAuthorize("hasAnyAuthority('ROLE_RH','ROLE_ADMIN','RH','ADMIN')")
    public ResponseEntity<ApiResponse<OvertimeDTO>> rhDecision(@PathVariable Long id, @RequestBody DecisionRequest request) {
        Overtime overtime = findScopedOvertime(id);
        String decision = requireDecision(request);
        overtime.setRhDecision(decision);
        overtime.setRhComment(resolveComment(request));
        overtime.setRhDecisionBy(currentReviewer());
        overtime.setReviewedBy(currentReviewer());
        overtime.setReviewedAt(LocalDateTime.now());
        if ("APPROVED".equals(decision)) {
            overtime.setStatus(OvertimeStatus.APPROVED_RH);
            overtime.setApprouvee(Boolean.TRUE);
        } else {
            overtime.setStatus(OvertimeStatus.REJECTED_RH);
            overtime.setApprouvee(Boolean.FALSE);
        }
        return ResponseEntity.ok(ApiResponse.success(overtimeMapper.toDto(overtimeRepository.save(overtime))));
    }

    private Overtime findOvertime(Long id) {
        return overtimeRepository.findById(id)
                .orElseThrow(() -> new PresenceBusinessException(HttpStatus.NOT_FOUND, "OVERTIME_NOT_FOUND", "Demande d'heures supplementaires introuvable."));
    }

    private Overtime findScopedOvertime(Long id) {
        Overtime overtime = findOvertime(id);
        Long entrepriseId = securityUtils.getCurrentEntrepriseId();
        if (entrepriseId != null && overtime.getEntrepriseId() != null && !Objects.equals(entrepriseId, overtime.getEntrepriseId())) {
            throw new PresenceBusinessException(HttpStatus.FORBIDDEN, "OVERTIME_FORBIDDEN", "Cette demande appartient a une autre entreprise.");
        }
        return overtime;
    }

    private Overtime findManagerScopedOvertime(Long id) {
        Overtime overtime = findScopedOvertime(id);
        if (isManagerOnly() && overtime.getManagerId() != null && !Objects.equals(overtime.getManagerId(), requireCurrentUser())) {
            throw new PresenceBusinessException(HttpStatus.FORBIDDEN, "OVERTIME_FORBIDDEN", "Cette demande n'appartient pas a votre equipe.");
        }
        return overtime;
    }

    private PageRequest pageRequest(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
    }

    private YearMonth resolvePeriod(Integer year, Integer month) {
        YearMonth current = YearMonth.now();
        int safeYear = year == null ? current.getYear() : year;
        int safeMonth = month == null ? current.getMonthValue() : Math.min(Math.max(month, 1), 12);
        return YearMonth.of(safeYear, safeMonth);
    }

    private Long requireCurrentUser() {
        Long userId = securityUtils.getCurrentUserId();
        if (userId == null) {
            throw new PresenceBusinessException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Utilisateur non authentifie.");
        }
        return userId;
    }

    private Long currentReviewer() {
        return requireCurrentUser();
    }

    private void setReview(Overtime overtime) {
        overtime.setReviewedBy(currentReviewer());
        overtime.setReviewedAt(LocalDateTime.now());
    }

    private void applyDecisionComment(Overtime overtime, DecisionRequest request) {
        String comment = resolveComment(request);
        if (comment == null) {
            return;
        }
        overtime.setReason(comment);
    }

    private String requireDecision(DecisionRequest request) {
        String decision = request != null && request.getDecision() != null
                ? request.getDecision().trim().toUpperCase()
                : null;
        if (!"APPROVED".equals(decision) && !"REJECTED".equals(decision)) {
            throw new PresenceBusinessException(HttpStatus.BAD_REQUEST, "OVERTIME_DECISION_INVALID", "Decision APPROVED ou REJECTED requise.");
        }
        return decision;
    }

    private String resolveComment(DecisionRequest request) {
        if (request == null) {
            return null;
        }
        String comment = request.getComment() != null ? request.getComment() : request.getReason();
        if (comment == null || comment.isBlank()) {
            return null;
        }
        return comment.trim();
    }

    private boolean isManagerOnly() {
        return hasAuthority("ROLE_MANAGER", "MANAGER") && !hasAuthority("ROLE_RH", "RH", "ROLE_ADMIN", "ADMIN");
    }

    private boolean hasAuthority(String... names) {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getAuthorities() == null) {
            return false;
        }
        Set<String> requested = Set.of(names);
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> requested.contains(authority.getAuthority()));
    }

    private long countByStatuses(Long entrepriseId, Set<OvertimeStatus> statuses) {
        if (entrepriseId == null) {
            return overtimeRepository.countByStatusIn(statuses);
        }
        return overtimeRepository.countByEntrepriseIdAndStatusIn(entrepriseId, statuses);
    }

    private Map<Long, UserSummaryDTO> loadUsersById(List<Overtime> rows) {
        List<Long> ids = rows.stream()
                .map(Overtime::getUtilisateurId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        try {
            return userServiceClient.getActiveUsers().stream()
                    .filter(user -> ids.contains(user.getId()))
                    .collect(Collectors.toMap(UserSummaryDTO::getId, Function.identity(), (left, right) -> left));
        } catch (Exception exception) {
            log.warn("Could not enrich overtime departments from organisation-service: {}", exception.getMessage());
            return ids.stream()
                    .map(id -> UserSummaryDTO.builder().id(id).departement("Utilisateur " + id).build())
                    .collect(Collectors.toMap(UserSummaryDTO::getId, Function.identity()));
        }
    }

    @Data
    public static class ReasonRequest {
        private String reason;
    }

    @Data
    public static class DecisionRequest {
        private String decision;
        private String comment;
        private String reason;

        static DecisionRequest approved(DecisionRequest source) {
            return withDecision(source, "APPROVED");
        }

        static DecisionRequest rejected(DecisionRequest source) {
            return withDecision(source, "REJECTED");
        }

        private static DecisionRequest withDecision(DecisionRequest source, String decision) {
            DecisionRequest request = source == null ? new DecisionRequest() : source;
            request.setDecision(decision);
            if (request.getComment() == null) {
                request.setComment(request.getReason());
            }
            return request;
        }
    }
}
