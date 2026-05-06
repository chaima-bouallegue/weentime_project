package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.ChangePasswordRequest;
import com.weentime.weentimeproject.dto.request.UserManagementRequest;
import com.weentime.weentimeproject.dto.request.UserProfileUpdateRequest;
import com.weentime.weentimeproject.dto.request.UtilisateurRequest;
import com.weentime.weentimeproject.dto.response.ActivityItemResponse;
import com.weentime.weentimeproject.dto.response.LookupOptionResponse;
import com.weentime.weentimeproject.dto.response.UserProfileResponse;
import com.weentime.weentimeproject.dto.response.UserSummaryResponse;
import com.weentime.weentimeproject.dto.response.UserManagementResponse;
import com.weentime.weentimeproject.dto.response.RoleResponse;
import com.weentime.weentimeproject.dto.response.UtilisateurResponse;
import com.weentime.weentimeproject.entity.Departement;
import com.weentime.weentimeproject.entity.Equipe;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.enums.RoleNom;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import com.weentime.weentimeproject.repository.DepartementRepository;
import com.weentime.weentimeproject.pagination.PageParams;
import com.weentime.weentimeproject.repository.EquipeRepository;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.repository.RoleRepository;
import com.weentime.weentimeproject.service.AvatarStorageService;
import com.weentime.weentimeproject.service.UtilisateurService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UtilisateurService utilisateurService;
    private final AvatarStorageService avatarStorageService;
    private final EntrepriseRepository entrepriseRepository;
    private final DepartementRepository departementRepository;
    private final EquipeRepository equipeRepository;
    private final RoleRepository roleRepository;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<Page<UserManagementResponse>> getUsers(
            @Valid @ModelAttribute PageParams params,
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search) {
        Page<UtilisateurResponse> page = utilisateurService.getAllUtilisateurs(params.toPageable(), companyId);
        List<UtilisateurResponse> source = page.getContent();
        List<UtilisateurResponse> filtered = applyFilters(source, role, status, search);
        Map<Long, UserSummaryResponse> managersById = loadManagers(filtered);
        List<UserManagementResponse> content = filtered.stream()
                .map(user -> toManagementResponse(user, managersById))
                .toList();

        if (hasFilter(role, status, search)) {
            return ResponseEntity.ok(new PageImpl<>(content, page.getPageable(), content.size()));
        }

        return ResponseEntity.ok(new PageImpl<>(content, page.getPageable(), page.getTotalElements()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UserManagementResponse> getUserById(@PathVariable Long id) {
        UtilisateurResponse user = utilisateurService.getUtilisateurById(id);
        Map<Long, UserSummaryResponse> managersById = loadManagers(List.of(user));
        return ResponseEntity.ok(toManagementResponse(user, managersById));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UserManagementResponse> createUser(@Valid @RequestBody UserManagementRequest request) {
        UtilisateurRequest payload = toUtilisateurRequest(request, false);
        UtilisateurResponse created = utilisateurService.createUtilisateur(payload);
        if (request.getManagerId() != null) {
            validateManagerEligibility(request.getManagerId(), created.getEntrepriseId());
            created = utilisateurService.assignManager(created.getId(), request.getManagerId());
        }
        Map<Long, UserSummaryResponse> managersById = loadManagers(List.of(created));
        return new ResponseEntity<>(toManagementResponse(created, managersById), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<UserManagementResponse> updateUser(
            @PathVariable Long id,
            @Valid @RequestBody UserManagementRequest request) {
        UtilisateurRequest payload = toUtilisateurRequest(request, true);
        UtilisateurResponse updated = utilisateurService.updateUtilisateur(id, payload);
        if (request.getManagerId() != null) {
            validateManagerEligibility(request.getManagerId(), updated.getEntrepriseId());
            updated = utilisateurService.assignManager(updated.getId(), request.getManagerId());
        } else {
            updated = utilisateurService.assignManager(updated.getId(), null);
        }
        Map<Long, UserSummaryResponse> managersById = loadManagers(List.of(updated));
        return ResponseEntity.ok(toManagementResponse(updated, managersById));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        utilisateurService.deleteUtilisateur(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/roles")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<List<String>> getRoles() {
        List<String> roles = List.of(RoleNom.ROLE_ADMIN, RoleNom.ROLE_RH, RoleNom.ROLE_MANAGER, RoleNom.ROLE_EMPLOYEE)
                .stream()
                .map(this::toExternalRole)
                .toList();
        return ResponseEntity.ok(roles);
    }

    @GetMapping("/statuses")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<List<String>> getStatuses() {
        List<String> statuses = List.of(
                        StatutUtilisateurEnum.ACTIF,
                        StatutUtilisateurEnum.INACTIF,
                        StatutUtilisateurEnum.SUSPENDU
                )
                .stream()
                .map(this::toExternalStatus)
                .toList();
        return ResponseEntity.ok(statuses);
    }

    @GetMapping("/companies")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<List<LookupOptionResponse>> getCompanies() {
        List<LookupOptionResponse> companies = entrepriseRepository.findAll()
                .stream()
                .sorted(Comparator.comparing(Entreprise::getNom, String.CASE_INSENSITIVE_ORDER))
                .map(company -> LookupOptionResponse.builder()
                        .id(company.getId())
                        .name(company.getNom())
                        .build())
                .toList();
        return ResponseEntity.ok(companies);
    }

    @GetMapping("/departments")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<List<LookupOptionResponse>> getDepartments(
            @RequestParam(required = false) Long companyId) {
        List<Departement> departments = companyId == null
                ? departementRepository.findAll().stream()
                .sorted(Comparator.comparing(Departement::getNom, String.CASE_INSENSITIVE_ORDER))
                .toList()
                : departementRepository.findByEntreprise_IdOrderByNomAsc(companyId);

        List<LookupOptionResponse> options = departments.stream()
                .map(department -> LookupOptionResponse.builder()
                        .id(department.getId())
                        .name(department.getNom())
                        .build())
                .toList();
        return ResponseEntity.ok(options);
    }

    @GetMapping("/teams")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<List<LookupOptionResponse>> getTeams(
            @RequestParam(required = false) Long departmentId) {
        List<Equipe> teams = departmentId == null
                ? equipeRepository.findAll().stream()
                .sorted(Comparator.comparing(Equipe::getNom, String.CASE_INSENSITIVE_ORDER))
                .toList()
                : equipeRepository.findByDepartement_IdOrderByNomAsc(departmentId);

        List<LookupOptionResponse> options = teams.stream()
                .map(team -> LookupOptionResponse.builder()
                        .id(team.getId())
                        .name(team.getNom())
                        .build())
                .toList();
        return ResponseEntity.ok(options);
    }

    @GetMapping("/managers")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<List<LookupOptionResponse>> getManagers(
            @RequestParam(required = false) Long companyId) {
        List<LookupOptionResponse> managers = utilisateurService.getAllUtilisateurs(Pageable.unpaged(), companyId)
                .getContent()
                .stream()
                .filter(user -> user.getStatut() == StatutUtilisateurEnum.ACTIF)
                .filter(user -> {
                    String role = resolvePrimaryRole(user);
                    return "MANAGER".equals(role) || "RH".equals(role);
                })
                .map(user -> LookupOptionResponse.builder()
                        .id(user.getId())
                        .name(buildDisplayName(user.getPrenom(), user.getNom(), user.getEmail()))
                        .build())
                .sorted(Comparator.comparing(LookupOptionResponse::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
        return ResponseEntity.ok(managers);
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getCurrentUser() {
        return ResponseEntity.ok(utilisateurService.getCurrentUserProfile());
    }

    @PutMapping("/me")
    public ResponseEntity<UserProfileResponse> updateCurrentUser(@Valid @RequestBody UserProfileUpdateRequest request) {
        return ResponseEntity.ok(utilisateurService.updateCurrentUserProfile(request));
    }

    @PostMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> uploadAvatar(@RequestPart("avatar") MultipartFile avatar) {
        return ResponseEntity.ok(Map.of("avatarUrl", utilisateurService.updateCurrentUserAvatar(avatar)));
    }

    @GetMapping("/avatar/{filename:.+}")
    public ResponseEntity<Resource> getAvatar(@PathVariable String filename) {
        Resource resource = avatarStorageService.loadAvatar(filename);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }

    @PutMapping("/me/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        utilisateurService.changePassword(request);
        return ResponseEntity.ok().build();
    }

    @GetMapping({"/me/activity", "/me/activity-log", "/me/user-activity", "/activity-log", "/user-activity"})
    public ResponseEntity<java.util.List<ActivityItemResponse>> getActivityHistory() {
        return ResponseEntity.ok(utilisateurService.getActivityHistory());
    }

    private UtilisateurRequest toUtilisateurRequest(UserManagementRequest request, boolean update) {
        String firstName = defaultString(request.getFirstName(), "").trim();
        String lastName = defaultString(request.getLastName(), "").trim();
        RoleNom roleNom = toInternalRole(request.getRole());
        StatutUtilisateurEnum statut = toInternalStatus(request.getStatus());
        Long roleId = roleRepository.findByNom(roleNom)
                .orElseThrow(() -> new IllegalArgumentException("Role invalide: " + request.getRole()))
                .getId();

        if (!update && (request.getPassword() == null || request.getPassword().isBlank())) {
            throw new IllegalArgumentException("Le mot de passe est obligatoire.");
        }

        return UtilisateurRequest.builder()
                .nom(lastName)
                .prenom(firstName)
                .email(request.getEmail().trim())
                .motDePasse(request.getPassword() == null ? "" : request.getPassword())
                .telephone(request.getPhone())
                .poste(request.getPosition())
                .statut(statut)
                .entrepriseId(request.getCompanyId())
                .departementId(request.getDepartmentId())
                .equipeId(request.getTeamId())
                .role(toExternalRole(roleNom))
                .roleIds(Set.of(roleId))
                .build();
    }

    private List<UtilisateurResponse> applyFilters(
            Collection<UtilisateurResponse> source,
            String role,
            String status,
            String search) {
        String normalizedRole = normalize(role);
        String normalizedStatus = normalize(status);
        String normalizedSearch = normalize(search);

        return source.stream()
                .filter(user -> {
                    if (normalizedRole.isEmpty()) {
                        return true;
                    }
                    return normalize(resolvePrimaryRole(user)).equals(normalizedRole);
                })
                .filter(user -> {
                    if (normalizedStatus.isEmpty()) {
                        return true;
                    }
                    return normalize(toExternalStatus(user.getStatut())).equals(normalizedStatus);
                })
                .filter(user -> {
                    if (normalizedSearch.isEmpty()) {
                        return true;
                    }
                    String fullName = buildDisplayName(user.getPrenom(), user.getNom(), user.getEmail());
                    return normalize(fullName).contains(normalizedSearch)
                            || normalize(user.getEmail()).contains(normalizedSearch);
                })
                .toList();
    }

    private boolean hasFilter(String role, String status, String search) {
        return !normalize(role).isEmpty() || !normalize(status).isEmpty() || !normalize(search).isEmpty();
    }

    private Map<Long, UserSummaryResponse> loadManagers(List<UtilisateurResponse> users) {
        Set<Long> managerIds = users.stream()
                .map(UtilisateurResponse::getManagerId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        if (managerIds.isEmpty()) {
            return Map.of();
        }

        return utilisateurService.getUserSummaries(managerIds)
                .stream()
                .collect(Collectors.toMap(UserSummaryResponse::getId, manager -> manager));
    }

    private UserManagementResponse toManagementResponse(
            UtilisateurResponse user,
            Map<Long, UserSummaryResponse> managersById) {
        LookupOptionResponse manager = null;
        if (user.getManagerId() != null) {
            UserSummaryResponse managerSummary = managersById.get(user.getManagerId());
            String managerName = managerSummary != null
                    ? defaultString(managerSummary.getFullName(), buildDisplayName(managerSummary.getPrenom(), managerSummary.getNom(), managerSummary.getEmail()))
                    : null;
            manager = LookupOptionResponse.builder()
                    .id(user.getManagerId())
                    .name(defaultString(managerName, "Non assigne"))
                    .build();
        }

        LookupOptionResponse company = null;
        if (user.getEntrepriseId() != null) {
            company = LookupOptionResponse.builder()
                    .id(user.getEntrepriseId())
                    .name(defaultString(user.getEntrepriseNom(), ""))
                    .build();
        }

        return UserManagementResponse.builder()
                .id(user.getId())
                .name(buildDisplayName(user.getPrenom(), user.getNom(), user.getEmail()))
                .email(user.getEmail())
                .role(resolvePrimaryRole(user))
                .status(toExternalStatus(user.getStatut()))
                .manager(manager)
                .company(company)
                .build();
    }

    private void validateManagerEligibility(Long managerId, Long expectedCompanyId) {
        UtilisateurResponse manager = utilisateurService.getUtilisateurById(managerId);
        boolean isEligible = manager.getRoles() != null && manager.getRoles().stream()
                .map(RoleResponse::getNom)
                .anyMatch(role -> role == RoleNom.ROLE_MANAGER || role == RoleNom.ROLE_RH);
        if (!isEligible) {
            throw new IllegalArgumentException("Le manager doit avoir le role MANAGER ou RH.");
        }
        if (expectedCompanyId != null && manager.getEntrepriseId() != null
                && !Objects.equals(expectedCompanyId, manager.getEntrepriseId())) {
            throw new IllegalArgumentException("Le manager doit appartenir a la meme entreprise.");
        }
    }

    private RoleNom toInternalRole(String role) {
        String normalized = normalize(role).toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "ADMIN" -> RoleNom.ROLE_ADMIN;
            case "RH" -> RoleNom.ROLE_RH;
            case "MANAGER" -> RoleNom.ROLE_MANAGER;
            case "EMPLOYEE" -> RoleNom.ROLE_EMPLOYEE;
            default -> throw new IllegalArgumentException("Role invalide: " + role);
        };
    }

    private String toExternalRole(RoleNom role) {
        if (role == null) {
            return "EMPLOYEE";
        }
        String raw = role.name();
        return raw.startsWith("ROLE_") ? raw.substring("ROLE_".length()) : raw;
    }

    private StatutUtilisateurEnum toInternalStatus(String status) {
        String normalized = normalize(status).toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "ACTIVE", "ACTIF" -> StatutUtilisateurEnum.ACTIF;
            case "INACTIVE", "INACTIF" -> StatutUtilisateurEnum.INACTIF;
            case "SUSPENDED", "SUSPENDU" -> StatutUtilisateurEnum.SUSPENDU;
            default -> throw new IllegalArgumentException("Statut invalide: " + status);
        };
    }

    private String toExternalStatus(StatutUtilisateurEnum status) {
        if (status == null) {
            return "INACTIVE";
        }
        return switch (status) {
            case ACTIF -> "ACTIVE";
            case INACTIF -> "INACTIVE";
            case SUSPENDU -> "SUSPENDED";
            default -> status.name();
        };
    }

    private String resolvePrimaryRole(UtilisateurResponse user) {
        if (user == null || user.getRoles() == null || user.getRoles().isEmpty()) {
            return "EMPLOYEE";
        }
        Set<RoleNom> roles = user.getRoles().stream()
                .map(RoleResponse::getNom)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (roles.contains(RoleNom.ROLE_ADMIN)) {
            return "ADMIN";
        }
        if (roles.contains(RoleNom.ROLE_RH)) {
            return "RH";
        }
        if (roles.contains(RoleNom.ROLE_MANAGER)) {
            return "MANAGER";
        }
        return "EMPLOYEE";
    }

    private String buildDisplayName(String prenom, String nom, String fallback) {
        String value = (defaultString(prenom, "") + " " + defaultString(nom, "")).trim();
        return value.isBlank() ? defaultString(fallback, "") : value;
    }

    private String normalize(String value) {
        return defaultString(value, "").trim().toLowerCase(Locale.ROOT);
    }

    private String defaultString(String value, String fallback) {
        return value == null ? fallback : value;
    }
}
