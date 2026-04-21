package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.NotificationDispatchRequest;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.NotificationType;
import com.weentime.weentimeproject.enums.RoleNom;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import com.weentime.weentimeproject.repository.NotificationRepository;
import com.weentime.weentimeproject.repository.PresenceRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PresenceNotificationScheduler {

    private final UtilisateurRepository utilisateurRepository;
    private final PresenceRepository presenceRepository;
    private final NotificationRepository notificationRepository;
    private final NotificationService notificationService;

    @Scheduled(cron = "0 */15 10-18 * * MON-FRI")
    public void notifyDailyAbsences() {
        LocalDate today = LocalDate.now();
        if (today.getDayOfWeek() == DayOfWeek.SATURDAY || today.getDayOfWeek() == DayOfWeek.SUNDAY) {
            return;
        }

        utilisateurRepository.findByStatut(StatutUtilisateurEnum.ACTIF).stream()
                .filter(this::shouldTrackAbsence)
                .filter(user -> !presenceRepository.existsByUtilisateurIdAndDatePresence(user.getId(), today))
                .forEach(user -> notifyAbsence(user, today));
    }

    private boolean shouldTrackAbsence(Utilisateur user) {
        if (user == null || user.getId() == null || user.getRoles() == null || user.getRoles().isEmpty()) {
            return false;
        }

        Set<RoleNom> roles = user.getRoles().stream()
                .map(role -> role.getNom())
                .collect(Collectors.toSet());

        if (roles.contains(RoleNom.ROLE_ADMIN) || roles.contains(RoleNom.ROLE_RH)) {
            return false;
        }

        return roles.contains(RoleNom.ROLE_EMPLOYEE) || roles.contains(RoleNom.ROLE_MANAGER);
    }

    private void notifyAbsence(Utilisateur user, LocalDate today) {
        String employeeName = buildFullName(user);
        String title = "Absence detectee - " + employeeName;
        Map<String, Object> metadata = Map.of(
                "actor", "Presence monitoring",
                "category", "presence",
                "priority", "critical",
                "status", "ABSENT",
                "employeeId", user.getId(),
                "employeeName", employeeName,
                "date", today.toString()
        );

        if (user.getManager() != null && !user.getManager().getId().equals(user.getId())) {
            sendIfNotAlreadySent(
                    user.getManager().getId(),
                    title,
                    NotificationDispatchRequest.builder()
                            .title(title)
                            .message(employeeName + " n'a pas effectue de check-in aujourd'hui.")
                            .type(NotificationType.PRESENCE)
                            .actionUrl("/app/manager/equipe")
                            .metadata(metadata)
                            .build(),
                    today
            );
        }

        List<Utilisateur> rhUsers = user.getEntrepriseId() == null
                ? List.of()
                : utilisateurRepository.findByEntreprise_IdAndRoles_NomOrderByDateCreationDesc(user.getEntrepriseId(), RoleNom.ROLE_RH);

        for (Utilisateur rhUser : rhUsers) {
            if (rhUser.getStatut() != StatutUtilisateurEnum.ACTIF) {
                continue;
            }
            sendIfNotAlreadySent(
                    rhUser.getId(),
                    title,
                    NotificationDispatchRequest.builder()
                            .title(title)
                            .message(employeeName + " est absent ce jour et requiert un suivi RH.")
                            .type(NotificationType.PRESENCE)
                            .actionUrl("/app/rh/presence")
                            .metadata(metadata)
                            .build(),
                    today
            );
        }
    }

    private void sendIfNotAlreadySent(Long recipientId, String title, NotificationDispatchRequest request, LocalDate today) {
        LocalDateTime start = today.atStartOfDay();
        LocalDateTime end = today.atTime(LocalTime.MAX);
        boolean alreadySent = notificationRepository.existsByUser_IdAndTypeAndTitleAndCreatedAtBetween(
                recipientId,
                NotificationType.PRESENCE,
                title,
                start,
                end
        );

        if (alreadySent) {
            return;
        }

        try {
            notificationService.notifyUser(recipientId, request);
        } catch (Exception exception) {
            log.warn("Unable to dispatch absence notification to user {}: {}", recipientId, exception.getMessage());
        }
    }

    private String buildFullName(Utilisateur user) {
        String prenom = user.getPrenom() == null ? "" : user.getPrenom().trim();
        String nom = user.getNom() == null ? "" : user.getNom().trim();
        String fullName = (prenom + " " + nom).trim();
        return fullName.isBlank() ? "Collaborateur" : fullName;
    }
}
