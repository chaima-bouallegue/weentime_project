package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.client.PresenceServiceClient;
import com.weentime.weentimeapp.client.dto.PresenceStatsClientDto;
import com.weentime.weentimeapp.client.dto.TeamStatusClientDto;
import com.weentime.weentimeapp.dto.CongeDTO;
import com.weentime.weentimeapp.dto.DemandeDTO;
import com.weentime.weentimeapp.dto.RhDashboardDTO;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.TypeDemandeEnum;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.CongeService;
import com.weentime.weentimeapp.service.DemandeService;
import com.weentime.weentimeapp.service.RhDashboardService;
import com.weentime.weentimeapp.service.UserCacheService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class RhDashboardServiceImpl implements RhDashboardService {

    private final OrganisationServiceClient organisationServiceClient;
    private final PresenceServiceClient presenceServiceClient;
    private final DemandeService demandeService;
    private final CongeService congeService;
    private final UserCacheService userCacheService;

    @Override
    public RhDashboardDTO getDashboard() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            return RhDashboardDTO.builder().build();
        }
        List<UserResponse> employees = loadEmployees(entrepriseId);
        Map<Long, UserResponse> employeesById = employees.stream()
                .filter(user -> user.getId() != null)
                .collect(Collectors.toMap(UserResponse::getId, user -> user, (left, right) -> left, LinkedHashMap::new));
        userCacheService.seedAll(employees);

        TeamStatusClientDto companyToday = loadCompanyToday();
        PresenceStatsClientDto companyStats = loadCompanyStats();
        List<DemandeDTO> demandes = demandeService.getAllForEntreprise(entrepriseId);
        List<CongeDTO> pendingConges = congeService.getPendingForEntreprise(entrepriseId);

        long totalEmployees = employees.size();
        long presentCount = companyToday != null ? companyToday.getPresentMembers() : 0L;
        long absentCount = companyToday != null ? companyToday.getAbsentMembers() : 0L;
        long remoteCount = companyToday == null || companyToday.getMembers() == null ? 0L : companyToday.getMembers().stream()
                .filter(member -> "REMOTE".equalsIgnoreCase(member.getStatus()))
                .count();
        BigDecimal totalHoursWorked = Optional.ofNullable(companyStats)
                .map(PresenceStatsClientDto::getTotalHoursWorked)
                .orElse(BigDecimal.ZERO)
                .setScale(2, RoundingMode.HALF_UP);
        double attendanceRate = totalEmployees == 0 ? 0d : BigDecimal.valueOf((double) presentCount / totalEmployees * 100d)
                .setScale(2, RoundingMode.HALF_UP)
                .doubleValue();

        return RhDashboardDTO.builder()
                .totalEmployees(totalEmployees)
                .presentCount(presentCount)
                .absentCount(absentCount)
                .hoursWorked(totalHoursWorked)
                .attendanceRate(attendanceRate)
                .pendingRequests(buildPendingRequests(pendingConges, employeesById))
                .attendanceStats(RhDashboardDTO.AttendanceStats.builder()
                        .present(presentCount)
                        .absent(absentCount)
                        .remote(remoteCount)
                        .build())
                .requestStats(buildRequestStats(demandes))
                .highlightedEmployees(buildHighlightedEmployees(companyToday, employeesById))
                .recentActivities(buildRecentActivities(demandes, employeesById))
                .departmentEmployeeCounts(buildDepartmentCounts(employees))
                .monthlyRequestEvolution(buildMonthlyEvolution(demandes))
                .requestStatusDistribution(buildRequestStatusDistribution(demandes))
                .build();
    }

    private List<UserResponse> loadEmployees(Long entrepriseId) {
        if (entrepriseId == null) {
            return List.of();
        }
        try {
            return organisationServiceClient.findUsersByEntreprise(entrepriseId).stream()
                    .filter(Objects::nonNull)
                    .filter(user -> user.getId() != null)
                    .toList();
        } catch (Exception exception) {
            log.warn("Unable to load employees for entreprise {}: {}", entrepriseId, exception.getMessage());
            return List.of();
        }
    }

    private TeamStatusClientDto loadCompanyToday() {
        try {
            return Optional.ofNullable(presenceServiceClient.getCompanyToday())
                    .map(com.weentime.weentimeapp.dto.ApiResponse::getData)
                    .orElse(null);
        } catch (Exception exception) {
            log.warn("Unable to load company today status: {}", exception.getMessage());
            return null;
        }
    }

    private PresenceStatsClientDto loadCompanyStats() {
        try {
            return Optional.ofNullable(presenceServiceClient.getCompanyStats())
                    .map(com.weentime.weentimeapp.dto.ApiResponse::getData)
                    .orElse(null);
        } catch (Exception exception) {
            log.warn("Unable to load company stats: {}", exception.getMessage());
            return null;
        }
    }

    private List<RhDashboardDTO.DashboardLeaveRequestDTO> buildPendingRequests(List<CongeDTO> pendingConges, Map<Long, UserResponse> employeesById) {
        return (pendingConges == null ? List.<CongeDTO>of() : pendingConges).stream()
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(CongeDTO::getDateCreation, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(conge -> {
                    UserResponse employee = employeesById.get(conge.getUtilisateurId());
                    return RhDashboardDTO.DashboardLeaveRequestDTO.builder()
                            .id(conge.getId())
                            .userId(conge.getUtilisateurId())
                            .type(Optional.ofNullable(conge.getTypeCongeNom()).filter(value -> !value.isBlank()).orElse("CONGE"))
                            .startDate(conge.getDateDebut())
                            .endDate(conge.getDateFin())
                            .status(Optional.ofNullable(conge.getStatut()).map(StatutDemandeEnum::toJson).orElse("EN_ATTENTE_RH"))
                            .validatedBy(conge.getManagerId())
                            .employeeName(resolveFullName(employee))
                            .employeeEmail(employee != null ? employee.getEmail() : null)
                            .department(employee != null ? employee.getDepartementNom() : null)
                            .build();
                })
                .toList();
    }

    private RhDashboardDTO.RequestStats buildRequestStats(List<DemandeDTO> demandes) {
        Map<TypeDemandeEnum, Long> counts = (demandes == null ? Stream.<DemandeDTO>empty() : demandes.stream())
                .filter(Objects::nonNull)
                .filter(demande -> demande.getTypeDemande() != null)
                .collect(Collectors.groupingBy(DemandeDTO::getTypeDemande, LinkedHashMap::new, Collectors.counting()));

        return RhDashboardDTO.RequestStats.builder()
                .leave(counts.getOrDefault(TypeDemandeEnum.CONGE, 0L))
                .autorisation(counts.getOrDefault(TypeDemandeEnum.AUTORISATION, 0L))
                .teletravail(counts.getOrDefault(TypeDemandeEnum.TELETRAVAIL, 0L))
                .build();
    }

    private List<RhDashboardDTO.DashboardEmployeeDTO> buildHighlightedEmployees(TeamStatusClientDto companyToday, Map<Long, UserResponse> employeesById) {
        if (companyToday == null || companyToday.getMembers() == null) {
            return List.of();
        }

        return companyToday.getMembers().stream()
                .filter(Objects::nonNull)
                .filter(member -> List.of("ABSENT", "LATE", "ON_LEAVE", "REMOTE").contains(normalizeStatus(member.getStatus())))
                .sorted(Comparator
                        .comparing((TeamStatusClientDto.MemberStatusClientDto member) -> priority(member.getStatus()))
                        .thenComparing(TeamStatusClientDto.MemberStatusClientDto::getNomComplet, Comparator.nullsLast(String::compareToIgnoreCase)))
                .limit(6)
                .map(member -> {
                    UserResponse employee = employeesById.get(member.getUtilisateurId());
                    return RhDashboardDTO.DashboardEmployeeDTO.builder()
                            .id(member.getUtilisateurId())
                            .firstName(employee != null ? employee.getPrenom() : firstName(member.getNomComplet()))
                            .lastName(employee != null ? employee.getNom() : lastName(member.getNomComplet()))
                            .email(employee != null ? employee.getEmail() : null)
                            .role("EMPLOYEE")
                            .department(employee != null ? employee.getDepartementNom() : null)
                            .status(mapEmployeeStatus(member.getStatus()))
                            .team(Optional.ofNullable(member.getEquipe()).orElse(employee != null ? employee.getEquipe() : null))
                            .build();
                })
                .toList();
    }

    private List<RhDashboardDTO.DashboardActivityDTO> buildRecentActivities(List<DemandeDTO> demandes, Map<Long, UserResponse> employeesById) {
        return (demandes == null ? Stream.<DemandeDTO>empty() : demandes.stream())
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(DemandeDTO::getDateCreation, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(8)
                .map(demande -> {
                    UserResponse employee = employeesById.get(demande.getUtilisateurId());
                    String employeeName = resolveFullName(employee);
                    String typeLabel = demande.getTypeDemande() == null ? "demande" : demande.getTypeDemande().name().toLowerCase(Locale.ROOT);
                    String statusLabel = demande.getStatut() == null ? "mise a jour" : demande.getStatut().toJson().toLowerCase(Locale.ROOT);
                    return RhDashboardDTO.DashboardActivityDTO.builder()
                            .id("demande-" + demande.getId())
                            .title(employeeName.isBlank() ? "Workflow RH" : employeeName)
                            .description((employeeName.isBlank() ? "Une" : employeeName + " a une") + " " + typeLabel + " " + statusLabel + ".")
                            .date(Optional.ofNullable(demande.getDateDecision()).orElse(demande.getDateCreation()))
                            .type(demande.getTypeDemande() == null ? null : demande.getTypeDemande().name())
                            .route("/app/rh/requests")
                            .build();
                })
                .toList();
    }

    private Map<String, Long> buildDepartmentCounts(List<UserResponse> employees) {
        return (employees == null ? Stream.<UserResponse>empty() : employees.stream())
                .map(user -> Optional.ofNullable(user.getDepartementNom()).filter(value -> !value.isBlank()).orElse("Non renseigne"))
                .collect(Collectors.groupingBy(value -> value, LinkedHashMap::new, Collectors.counting()));
    }

    private Map<Integer, Long> buildMonthlyEvolution(List<DemandeDTO> demandes) {
        Map<Integer, Long> months = (demandes == null ? Stream.<DemandeDTO>empty() : demandes.stream())
                .filter(demande -> demande.getDateCreation() != null)
                .collect(Collectors.groupingBy(
                        demande -> demande.getDateCreation().getMonthValue(),
                        LinkedHashMap::new,
                        Collectors.counting()
                ));
        for (int month = 1; month <= 12; month++) {
            months.putIfAbsent(month, 0L);
        }
        return months;
    }

    private Map<String, Long> buildRequestStatusDistribution(List<DemandeDTO> demandes) {
        return (demandes == null ? Stream.<DemandeDTO>empty() : demandes.stream())
                .filter(demande -> demande.getStatut() != null)
                .collect(Collectors.groupingBy(
                        demande -> demande.getStatut().toJson(),
                        LinkedHashMap::new,
                        Collectors.counting()
                ));
    }

    private String resolveFullName(UserResponse user) {
        if (user == null) {
            return "";
        }
        return Stream.of(user.getPrenom(), user.getNom())
                .filter(Objects::nonNull)
                .filter(value -> !value.isBlank())
                .collect(Collectors.joining(" "))
                .trim();
    }

    private String normalizeStatus(String status) {
        return status == null ? "ACTIVE" : status.trim().toUpperCase(Locale.ROOT);
    }

    private int priority(String status) {
        return switch (normalizeStatus(status)) {
            case "ABSENT" -> 0;
            case "LATE" -> 1;
            case "ON_LEAVE" -> 2;
            case "REMOTE" -> 3;
            default -> 4;
        };
    }

    private String mapEmployeeStatus(String presenceStatus) {
        return switch (normalizeStatus(presenceStatus)) {
            case "ABSENT", "LATE" -> "ABSENT";
            case "ON_LEAVE", "REMOTE" -> "ON_LEAVE";
            default -> "ACTIVE";
        };
    }

    private String firstName(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return "Employe";
        }
        return fullName.trim().split("\\s+")[0];
    }

    private String lastName(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return "";
        }
        String[] parts = fullName.trim().split("\\s+");
        return parts.length > 1 ? String.join(" ", java.util.Arrays.copyOfRange(parts, 1, parts.length)) : "";
    }
}
