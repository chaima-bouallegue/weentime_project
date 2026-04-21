package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.DemandeDTO;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.dto.WorkflowStatusUpdateRequest;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.AutorisationService;
import com.weentime.weentimeapp.service.CongeService;
import com.weentime.weentimeapp.service.DemandeService;
import com.weentime.weentimeapp.service.TeletravailService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ManagerCompatibilityController {

    private final DemandeService demandeService;
    private final CongeService congeService;
    private final AutorisationService autorisationService;
    private final TeletravailService teletravailService;

    @GetMapping({"/requests/manager/pending", "/manager/requests/pending"})
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<ApiResponse<PageResponse<DemandeDTO>>> getPendingRequests(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        List<DemandeDTO> pending = getManagerDemandes().stream()
                .filter(demande -> demande.getStatut() == StatutDemandeEnum.EN_ATTENTE_MANAGER)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(toPage(pending, page, size)));
    }

    @GetMapping({"/demandes/manager", "/demandes/manager/all", "/manager/demandes"})
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<ApiResponse<PageResponse<DemandeDTO>>> getManagerDemandes(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String statut
    ) {
        List<DemandeDTO> demandes = getManagerDemandes();
        if (statut != null && !statut.isBlank()) {
            StatutDemandeEnum resolved = StatutDemandeEnum.fromValue(statut);
            demandes = demandes.stream()
                    .filter(demande -> demande.getStatut() == resolved)
                    .toList();
        }
        return ResponseEntity.ok(ApiResponse.success(toPage(demandes, page, size)));
    }

    @GetMapping("/manager/stats")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getManagerStats() {
        List<DemandeDTO> demandes = getManagerDemandes();
        long pending = demandes.stream().filter(d -> d.getStatut() == StatutDemandeEnum.EN_ATTENTE_MANAGER).count();
        long approved = demandes.stream().filter(d -> d.getStatut() == StatutDemandeEnum.APPROUVE).count();
        long rejected = demandes.stream().filter(d -> d.getStatut() == StatutDemandeEnum.REFUSE).count();

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("pendingCount", pending);
        stats.put("approvedCount", approved);
        stats.put("rejectedCount", rejected);
        stats.put("totalCount", demandes.size());
        return ResponseEntity.ok(ApiResponse.success(stats));
    }

    @GetMapping("/manager/workspace")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getManagerWorkspace() {
        List<DemandeDTO> demandes = getManagerDemandes();
        List<DemandeDTO> pending = demandes.stream()
                .filter(demande -> demande.getStatut() == StatutDemandeEnum.EN_ATTENTE_MANAGER)
                .toList();
        List<DemandeDTO> forwarded = demandes.stream()
                .filter(demande -> demande.getStatut() == StatutDemandeEnum.EN_ATTENTE_RH)
                .toList();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("pendingCount", pending.size());
        summary.put("forwardedCount", forwarded.size());
        summary.put("approvedCount", demandes.stream().filter(d -> d.getStatut() == StatutDemandeEnum.APPROUVE).count());
        summary.put("rejectedCount", demandes.stream().filter(d -> d.getStatut() == StatutDemandeEnum.REFUSE).count());
        summary.put("totalCount", demandes.size());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("summary", summary);
        payload.put("pendingRequests", pending);
        payload.put("recentRequests", demandes.stream().limit(20).toList());
        payload.put("requests", demandes);
        return ResponseEntity.ok(ApiResponse.success(payload));
    }

    @PutMapping("/demandes/{id}/statut")
    @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<ApiResponse<Object>> updateManagerRequestStatus(
            @PathVariable Long id,
            @RequestBody WorkflowStatusUpdateRequest request
    ) {
        boolean approve = request.getStatut() == StatutDemandeEnum.APPROUVE;
        boolean reject = request.getStatut() == StatutDemandeEnum.REFUSE;
        if (request.getTypeDemande() == null || (!approve && !reject)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le type de demande et un statut final sont requis.");
        }

        Object response = switch (request.getTypeDemande()) {
            case CONGE -> approve
                    ? congeService.validateByManager(id, SecurityUtils.getCurrentUserId())
                    : congeService.reject(id, SecurityUtils.getCurrentUserId(), request.getCommentaire());
            case AUTORISATION -> approve
                    ? autorisationService.validateManager(id, currentUserEmail())
                    : autorisationService.reject(id, currentUserEmail(), request.getCommentaire());
            case TELETRAVAIL -> approve
                    ? teletravailService.validerManager(id, SecurityUtils.getCurrentUserId(), request.getCommentaire())
                    : teletravailService.rejeterManager(id, SecurityUtils.getCurrentUserId(), request.getCommentaire());
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type de demande non pris en charge pour le manager.");
        };

        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private List<DemandeDTO> getManagerDemandes() {
        return demandeService.getByManager(SecurityUtils.getCurrentUserId()).stream()
                .sorted(Comparator.comparing(DemandeDTO::getDateCreation, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .toList();
    }

    private PageResponse<DemandeDTO> toPage(List<DemandeDTO> source, int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.max(size, 1);
        int start = Math.min(safePage * safeSize, source.size());
        int end = Math.min(start + safeSize, source.size());

        return PageResponse.<DemandeDTO>builder()
                .content(source.subList(start, end))
                .totalElements(source.size())
                .totalPages((int) Math.ceil((double) source.size() / safeSize))
                .number(safePage)
                .size(safeSize)
                .build();
    }

    private String currentUserEmail() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
