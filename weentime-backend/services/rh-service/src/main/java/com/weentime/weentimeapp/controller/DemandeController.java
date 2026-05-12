package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.DemandeDTO;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.TypeDemandeEnum;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.DemandeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/v1/rh/demandes")
@RequiredArgsConstructor
public class DemandeController {

    private final DemandeService service;

    @GetMapping
    @PreAuthorize("hasAnyRole('RH','MANAGER','ADMIN','SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PageResponse<DemandeDTO>>> getAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String employee,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo
    ) {
        return ResponseEntity.ok(ApiResponse.success(filterAndPage(
                service.getAllForEntreprise(SecurityUtils.getCurrentEntrepriseId()),
                page,
                size,
                statut,
                type,
                employee,
                dateFrom,
                dateTo
        )));
    }

    @GetMapping("/admin")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    public ResponseEntity<ApiResponse<PageResponse<DemandeDTO>>> getAllForAdminDashboard(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String employee,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo
    ) {
        return ResponseEntity.ok(ApiResponse.success(filterAndPage(
                service.getAll(),
                page,
                size,
                statut,
                type,
                employee,
                dateFrom,
                dateTo
        )));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('RH','MANAGER','ADMIN','SUPER_ADMIN')")
    public ResponseEntity<DemandeDTO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    @GetMapping("/utilisateur/{id}")
    @PreAuthorize("hasAnyRole('RH','MANAGER')")
    public ResponseEntity<List<DemandeDTO>> getByUtilisateur(@PathVariable Long id) {
        return ResponseEntity.ok(service.getAllByUtilisateur(id));
    }

    @GetMapping("/manager/{id}")
    @PreAuthorize("hasAnyRole('RH','MANAGER')")
    public ResponseEntity<List<DemandeDTO>> getByManager(@PathVariable Long id) {
        return ResponseEntity.ok(service.getByManager(id));
    }

    @GetMapping("/manager/{id}/all")
    @PreAuthorize("hasAnyRole('RH','MANAGER')")
    public ResponseEntity<ApiResponse<PageResponse<DemandeDTO>>> getByManagerPaged(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String employee,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo
    ) {
        return ResponseEntity.ok(ApiResponse.success(filterAndPage(
                service.getByManager(id),
                page,
                size,
                statut,
                type,
                employee,
                dateFrom,
                dateTo
        )));
    }

    private PageResponse<DemandeDTO> filterAndPage(
            List<DemandeDTO> source,
            int page,
            int size,
            String statut,
            String type,
            String employee,
            String dateFrom,
            String dateTo
    ) {
        String employeeFilter = employee == null ? null : employee.trim().toLowerCase(Locale.ROOT);
        LocalDate from = parseDate(dateFrom);
        LocalDate to = parseDate(dateTo);
        TypeDemandeEnum typeFilter = parseType(type);
        Set<StatutDemandeEnum> statutFilter = StatutDemandeEnum.resolveFilterValues(statut);

        List<DemandeDTO> demandes = source.stream()
                .filter(demande -> statutFilter == null || statutFilter.contains(demande.getStatut()))
                .filter(demande -> typeFilter == null || demande.getTypeDemande() == typeFilter)
                .filter(demande -> employeeFilter == null || employeeFilter.isBlank() || matchesEmployee(demande, employeeFilter))
                .filter(demande -> from == null || !resolveDate(demande).toLocalDate().isBefore(from))
                .filter(demande -> to == null || !resolveDate(demande).toLocalDate().isAfter(to))
                .sorted(Comparator.comparing(DemandeDTO::getDateCreation, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .toList();
        return toPage(demandes, page, size);
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

    private boolean matchesEmployee(DemandeDTO demande, String employeeFilter) {
        return Stream.of(
                        profileValue(demande.getUtilisateur(), "fullName"),
                        profileValue(demande.getUtilisateur(), "prenom"),
                        profileValue(demande.getUtilisateur(), "nom"),
                        profileValue(demande.getUtilisateur(), "email"))
                .filter(Objects::nonNull)
                .map(value -> value.toLowerCase(Locale.ROOT))
                .anyMatch(value -> value.contains(employeeFilter));
    }

    private String profileValue(Map<String, Object> profile, String key) {
        if (profile == null) {
            return null;
        }
        Object value = profile.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return LocalDate.parse(value);
    }

    private TypeDemandeEnum parseType(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return TypeDemandeEnum.valueOf(value.trim().toUpperCase(Locale.ROOT));
    }

    private LocalDateTime resolveDate(DemandeDTO demande) {
        return demande.getDateCreation() == null ? LocalDateTime.MIN : demande.getDateCreation();
    }
}
