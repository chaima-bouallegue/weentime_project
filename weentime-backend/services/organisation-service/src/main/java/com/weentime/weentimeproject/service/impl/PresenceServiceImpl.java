package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.NotificationDispatchRequest;
import com.weentime.weentimeproject.dto.response.PresenceResponse;
import com.weentime.weentimeproject.entity.Presence;
import com.weentime.weentimeproject.enums.NotificationType;
import com.weentime.weentimeproject.enums.PresenceStatus;
import com.weentime.weentimeproject.repository.PresenceRepository;
import com.weentime.weentimeproject.security.services.UserDetailsImpl;
import com.weentime.weentimeproject.service.NotificationService;
import com.weentime.weentimeproject.service.PresenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PresenceServiceImpl implements PresenceService {

    private static final LocalTime SCHEDULED_START = LocalTime.of(9, 0);
    private static final BigDecimal DAILY_BASE_HOURS = BigDecimal.valueOf(8);

    private final PresenceRepository presenceRepository;
    private final NotificationService notificationService;

    @Override
    @Transactional
    public PresenceResponse checkIn() {
        Long userId = currentUserId();
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();

        Optional<Presence> existingPresenceOpt = presenceRepository.findByUtilisateurIdAndDatePresence(userId, today);
        if (existingPresenceOpt.isPresent() && existingPresenceOpt.get().getHeureEntree() != null) {
            throw new RuntimeException("Vous avez deja effectue votre check-in aujourd'hui.");
        }

        Presence presence = existingPresenceOpt.orElseGet(() -> Presence.builder()
                .utilisateurId(userId)
                .datePresence(today)
                .build());

        presence.setHeureEntree(now);
        presence.setStatus(now.toLocalTime().isAfter(SCHEDULED_START) ? PresenceStatus.LATE : PresenceStatus.PRESENT);
        presenceRepository.save(presence);

        if (presence.getStatus() == PresenceStatus.LATE) {
            boolean repeatedLate = isLateAnomaly(userId, today);
            if (repeatedLate) {
                log.warn("Repeated late arrivals detected for user {}", userId);
            }
            notifyLateArrival(userId, now, repeatedLate);
        }

        return toResponse(presence, now);
    }

    @Override
    @Transactional
    public PresenceResponse checkOut() {
        Long userId = currentUserId();
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();

        Presence presence = presenceRepository.findByUtilisateurIdAndDatePresence(userId, today)
                .orElseThrow(() -> new RuntimeException("Aucun check-in trouve pour aujourd'hui."));

        if (presence.getHeureEntree() == null) {
            throw new RuntimeException("Check-in requis avant de pointer la sortie.");
        }
        if (presence.getHeureSortie() != null) {
            throw new RuntimeException("Vous avez deja effectue votre check-out aujourd'hui.");
        }
        if (now.isBefore(presence.getHeureEntree())) {
            throw new RuntimeException("L'heure de sortie ne peut pas etre anterieure a l'heure d'entree.");
        }

        BigDecimal workedHours = computeHours(presence.getHeureEntree(), now);
        BigDecimal overtime = workedHours.compareTo(DAILY_BASE_HOURS) > 0
                ? workedHours.subtract(DAILY_BASE_HOURS)
                : BigDecimal.ZERO;

        presence.setHeureSortie(now);
        presence.setTotalHeuresTravaillees(workedHours);
        presence.setOvertimeHours(overtime);
        presenceRepository.save(presence);

        return toResponse(presence, now);
    }

    @Override
    @Transactional(readOnly = true)
    public PresenceResponse getToday() {
        Long userId = currentUserId();
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();

        return presenceRepository.findByUtilisateurIdAndDatePresence(userId, today)
                .map(presence -> toResponse(presence, now))
                .orElseGet(() -> PresenceResponse.builder()
                        .date(today)
                        .clockIn(null)
                        .clockOut(null)
                        .hours(BigDecimal.ZERO)
                        .overtime(BigDecimal.ZERO)
                        .status(PresenceStatus.ABSENT)
                        .build());
    }

    @Override
    @Transactional(readOnly = true)
    public List<PresenceResponse> getHistory() {
        Long userId = currentUserId();
        LocalDateTime now = LocalDateTime.now();

        return presenceRepository.findByUtilisateurIdOrderByDatePresenceDesc(userId).stream()
                .map(presence -> toResponse(presence, now))
                .collect(Collectors.toList());
    }

    private PresenceResponse toResponse(Presence presence, LocalDateTime now) {
        BigDecimal hours = presence.getTotalHeuresTravaillees();
        if (hours == null && presence.getHeureEntree() != null) {
            LocalDateTime end = presence.getHeureSortie() != null ? presence.getHeureSortie() : now;
            hours = computeHours(presence.getHeureEntree(), end);
        }

        BigDecimal overtime = presence.getOvertimeHours();
        if (overtime == null && hours != null) {
            overtime = hours.compareTo(DAILY_BASE_HOURS) > 0
                    ? hours.subtract(DAILY_BASE_HOURS)
                    : BigDecimal.ZERO;
        }

        return PresenceResponse.builder()
                .date(presence.getDatePresence())
                .clockIn(presence.getHeureEntree())
                .clockOut(presence.getHeureSortie())
                .hours(hours != null ? hours : BigDecimal.ZERO)
                .overtime(overtime != null ? overtime : BigDecimal.ZERO)
                .status(presence.getStatus())
                .build();
    }

    private BigDecimal computeHours(LocalDateTime start, LocalDateTime end) {
        Duration duration = Duration.between(start, end);
        return BigDecimal.valueOf(duration.toMinutes())
                .divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
    }

    private Long currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserDetailsImpl userDetails)) {
            throw new RuntimeException("Utilisateur non authentifie.");
        }
        return userDetails.getId();
    }

    private boolean isLateAnomaly(Long userId, LocalDate today) {
        List<Presence> lastWeek = presenceRepository.findByUtilisateurIdOrderByDatePresenceDesc(userId).stream()
                .filter(presence -> !presence.getDatePresence().isAfter(today))
                .limit(7)
                .toList();
        long lateCount = lastWeek.stream()
                .filter(presence -> presence.getStatus() == PresenceStatus.LATE)
                .count();
        return lateCount >= 3;
    }

    private void notifyLateArrival(Long userId, LocalDateTime clockIn, boolean repeatedLate) {
        try {
            notificationService.notifyUser(userId, NotificationDispatchRequest.builder()
                    .title(repeatedLate ? "Retards repetes detectes" : "Retard detecte")
                    .message(repeatedLate
                            ? "Votre pointage de " + clockIn.toLocalTime() + " confirme plusieurs retards recents."
                            : "Vous avez pointe en retard a " + clockIn.toLocalTime() + ".")
                    .type(NotificationType.PRESENCE)
                    .actionUrl("/app/employee/presence")
                    .metadata(Map.of(
                            "actor", "Presence monitoring",
                            "category", "presence",
                            "priority", repeatedLate ? "high" : "normal",
                            "status", PresenceStatus.LATE.name()
                    ))
                    .build());
        } catch (Exception exception) {
            log.warn("Unable to notify late arrival for user {}: {}", userId, exception.getMessage());
        }
    }
}
