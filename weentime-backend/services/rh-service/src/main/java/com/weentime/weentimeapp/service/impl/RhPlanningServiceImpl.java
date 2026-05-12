package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.client.PresenceServiceClient;
import com.weentime.weentimeapp.dto.BulkNotificationRequest;
import com.weentime.weentimeapp.dto.BulkStatusRequest;
import com.weentime.weentimeapp.dto.NotificationPayload;
import com.weentime.weentimeapp.dto.UserResponse;
import com.weentime.weentimeapp.dto.response.EmployeeStatusDTO;
import com.weentime.weentimeapp.dto.response.PlanningResponseDTO;
import com.weentime.weentimeapp.entity.Autorisation;
import com.weentime.weentimeapp.entity.Conge;
import com.weentime.weentimeapp.entity.Teletravail;
import com.weentime.weentimeapp.enums.StatutJournee;
import com.weentime.weentimeapp.repository.AutorisationRepository;
import com.weentime.weentimeapp.repository.CongeRepository;
import com.weentime.weentimeapp.repository.TeletravailRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.AsyncNotificationService;
import com.weentime.weentimeapp.service.RhPlanningService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class RhPlanningServiceImpl implements RhPlanningService {

    private final OrganisationServiceClient organisationServiceClient;
    private final CongeRepository congeRepository;
    private final TeletravailRepository teletravailRepository;
    private final AutorisationRepository autorisationRepository;
    private final PresenceServiceClient presenceServiceClient;
    private final AsyncNotificationService asyncNotificationService;

    @Override
    public List<PlanningResponseDTO> getPlanning(LocalDate start, LocalDate end, Long teamId, Long departmentId) {
        long startTime = System.currentTimeMillis();
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();

        var attributes = org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
        var securityContext = org.springframework.security.core.context.SecurityContextHolder.getContext();

        CompletableFuture<List<UserResponse>> usersFuture = CompletableFuture.supplyAsync(() -> {
            org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(attributes);
            org.springframework.security.core.context.SecurityContextHolder.setContext(securityContext);
            try {
                return organisationServiceClient.findUsersByEntreprise(entrepriseId);
            } finally {
                org.springframework.security.core.context.SecurityContextHolder.clearContext();
                org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();
            }
        });

        CompletableFuture<Map<LocalDate, PresenceServiceClient.PresenceResponse>> presenceFuture = CompletableFuture.supplyAsync(() -> {
            org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(attributes);
            org.springframework.security.core.context.SecurityContextHolder.setContext(securityContext);
            try {
                return presenceServiceClient.getStatusRange(entrepriseId, teamId, start, end);
            } catch (Exception e) {
                log.error("Failed to fetch batch presence data: {}", e.getMessage());
                return Collections.emptyMap();
            } finally {
                org.springframework.security.core.context.SecurityContextHolder.clearContext();
                org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();
            }
        });

        List<Conge> conges = congeRepository.findApprovedForDateRange(entrepriseId, start, end);
        List<Teletravail> teletravails = teletravailRepository.findApprovedForDateRange(entrepriseId, start, end);
        List<Autorisation> autorisations = autorisationRepository.findApprovedForDateRange(entrepriseId, start, end);

        CompletableFuture.allOf(usersFuture, presenceFuture).join();

        List<UserResponse> allUsers = usersFuture.join();
        Map<LocalDate, PresenceServiceClient.PresenceResponse> rangePresence = presenceFuture.join();

        List<UserResponse> filteredUsers = allUsers.stream()
                .filter(u -> teamId == null || teamId.equals(u.getEquipeId()))
                .filter(u -> departmentId == null || departmentId.equals(u.getDepartementId()))
                .toList();

        Map<Long, Set<LocalDate>> congesIndex = indexDatesConge(conges);
        Map<Long, Set<LocalDate>> teletravailsIndex = indexDatesTeletravail(teletravails);
        Map<Long, Set<LocalDate>> autorisationsIndex = indexDatesAutorisation(autorisations);

        Map<LocalDate, Map<Long, PresenceServiceClient.MemberStatus>> pointagesIndex = new HashMap<>();
        rangePresence.forEach((date, resp) -> {
            if (resp != null && resp.getMembers() != null) {
                pointagesIndex.put(date, resp.getMembers().stream()
                        .collect(Collectors.toMap(PresenceServiceClient.MemberStatus::getId, m -> m, (m1, m2) -> m1)));
            }
        });

        LocalDate today = LocalDate.now();
        List<LocalDate> allDays = start.datesUntil(end.plusDays(1)).toList();

        List<PlanningResponseDTO> response = allDays.stream().map(date -> {
            boolean isRestDay = (date.getDayOfWeek() == java.time.DayOfWeek.SATURDAY || date.getDayOfWeek() == java.time.DayOfWeek.SUNDAY);

            List<EmployeeStatusDTO> dailyStatusList = filteredUsers.parallelStream().map(user -> {
                Long uid = user.getId();
                String status = "ABSENCE";
                String detail = "En attente";

                if (congesIndex.getOrDefault(uid, Collections.emptySet()).contains(date)) {
                    status = "LEAVE";
                    detail = "En Congé";
                } else if (teletravailsIndex.getOrDefault(uid, Collections.emptySet()).contains(date)) {
                    status = "REMOTE";
                    detail = "Télétravail";
                } else if (autorisationsIndex.getOrDefault(uid, Collections.emptySet()).contains(date)) {
                    status = "ABSENCE";
                    detail = "Absence Autorisée";
                } else {
                    var dailyPointages = pointagesIndex.getOrDefault(date, Collections.emptyMap());
                    var pStatus = dailyPointages.get(uid);
                    if (pStatus != null && pStatus.getArrivalTime() != null) {
                        status = "PRESENT";
                        detail = "Au bureau (" + pStatus.getArrivalTime() + ")";
                    } else if (date.isBefore(today)) {
                        status = "ABSENCE";
                        detail = "Non pointé";
                    }
                }

                return EmployeeStatusDTO.builder()
                        .id(uid).name(user.getNom()).prenom(user.getPrenom())
                        .email(user.getEmail()).poste(user.getPoste())
                        .departementName(user.getDepartementNom()).teamName(user.getEquipeNom())
                        .status(status).detail(detail).photoUrl(user.getPhoto())
                        .build();
            }).toList();

            long absentCount = dailyStatusList.stream().filter(s -> s.getStatus().equals("ABSENCE") || s.getStatus().equals("LEAVE")).count();
            int total = filteredUsers.size();
            long presents = total - absentCount;

            return PlanningResponseDTO.builder()
                    .date(date).employees(dailyStatusList)
                    .presenceRate(total > 0 ? (double) presents / total : 0.0)
                    .presenceText(presents + "/" + total)
                    .isRestDay(isRestDay)
                    .build();
        }).toList();

        log.info("[PLANNING] Calcul {} jours pour {} employés réalisé en {}ms", allDays.size(), filteredUsers.size(), System.currentTimeMillis() - startTime);
        return response;
    }

    private Map<Long, Set<LocalDate>> indexDatesConge(List<Conge> list) {
        Map<Long, Set<LocalDate>> index = new HashMap<>();
        for (Conge item : list) {
            Set<LocalDate> dates = index.computeIfAbsent(item.getUtilisateurId(), k -> new HashSet<>());
            item.getDateDebut().datesUntil(item.getDateFin().plusDays(1)).forEach(dates::add);
        }
        return index;
    }

    private Map<Long, Set<LocalDate>> indexDatesTeletravail(List<Teletravail> list) {
        Map<Long, Set<LocalDate>> index = new HashMap<>();
        for (Teletravail item : list) {
            Set<LocalDate> dates = index.computeIfAbsent(item.getUtilisateurId(), k -> new HashSet<>());
            item.getDateDebut().datesUntil(item.getDateFin().plusDays(1)).forEach(dates::add);
        }
        return index;
    }

    private Map<Long, Set<LocalDate>> indexDatesAutorisation(List<Autorisation> list) {
        Map<Long, Set<LocalDate>> index = new HashMap<>();
        for (Autorisation item : list) {
            Set<LocalDate> dates = index.computeIfAbsent(item.getUtilisateurId(), k -> new HashSet<>());
            dates.add(item.getDateAutorisation());
        }
        return index;
    }

    @Override
    public Map<Long, Map<LocalDate, StatutJournee>> getBulkStatus(BulkStatusRequest request) {
        long startTime = System.currentTimeMillis();
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();

        List<Conge> conges = congeRepository.findApprovedForUsersAndDateRange(entrepriseId, request.getUserIds(), request.getDateDebut(), request.getDateFin());
        List<Teletravail> teletravails = teletravailRepository.findApprovedForUsersAndDateRange(entrepriseId, request.getUserIds(), request.getDateDebut(), request.getDateFin());
        List<Autorisation> autorisations = autorisationRepository.findApprovedForUsersAndDateRange(entrepriseId, request.getUserIds(), request.getDateDebut(), request.getDateFin());

        Map<Long, Set<LocalDate>> congesIndex = indexDatesConge(conges);
        Map<Long, Set<LocalDate>> teletravailsIndex = indexDatesTeletravail(teletravails);
        Map<Long, Set<LocalDate>> autorisationsIndex = indexDatesAutorisation(autorisations);

        Map<Long, Map<LocalDate, StatutJournee>> result = new HashMap<>();
        for (Long userId : request.getUserIds()) {
            Map<LocalDate, StatutJournee> userMap = new HashMap<>();
            for (LocalDate date = request.getDateDebut(); !date.isAfter(request.getDateFin()); date = date.plusDays(1)) {
                if (congesIndex.getOrDefault(userId, Collections.emptySet()).contains(date)) {
                    userMap.put(date, StatutJournee.EN_CONGE);
                } else if (autorisationsIndex.getOrDefault(userId, Collections.emptySet()).contains(date)) {
                    userMap.put(date, StatutJournee.ABSENCE_JUSTIFIEE);
                } else if (teletravailsIndex.getOrDefault(userId, Collections.emptySet()).contains(date)) {
                    userMap.put(date, StatutJournee.TELETRAVAIL);
                } else {
                    userMap.put(date, StatutJournee.ABSENCE_INJUSTIFIEE);
                }
            }
            result.put(userId, userMap);
        }

        log.info("[PLANNING-BULK] {} employés sur {} jours en {}ms", request.getUserIds().size(),
                java.time.temporal.ChronoUnit.DAYS.between(request.getDateDebut(), request.getDateFin()) + 1,
                System.currentTimeMillis() - startTime);

        return result;
    }

    @Override
    public StatutJournee getStatutJournee(Long userId, LocalDate date) {
        if (congeRepository.findApprovedForUserAndDate(userId, date).isPresent()) return StatutJournee.EN_CONGE;
        if (autorisationRepository.findApprovedForUserAndDate(userId, date).isPresent()) return StatutJournee.ABSENCE_JUSTIFIEE;
        if (teletravailRepository.findApprovedForUserAndDate(userId, date).isPresent()) return StatutJournee.TELETRAVAIL;
        return StatutJournee.ABSENCE_INJUSTIFIEE;
    }

    @Override
    public void sendBulkNotification(BulkNotificationRequest request) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (request.getUserIds() == null || request.getUserIds().isEmpty()) return;

        NotificationPayload payload = NotificationPayload.of(
                "RH_PLANNING_ALERT",
                request.getTitre() != null ? request.getTitre() : "Notification RH",
                request.getMessage() != null ? request.getMessage() : "Vous avez une nouvelle notification concernant votre planning.",
                "bell",
                "blue",
                null,
                "PLANNING",
                "/app/employee/planning"
        );

        for (Long userId : request.getUserIds()) {
            asyncNotificationService.sendToUser(userId, payload, entrepriseId);
        }

        log.info("[PLANNING-NOTIF] {} notifications envoyées en bulk pour entreprise {}",
                request.getUserIds().size(), entrepriseId);
    }
}
