package com.weentime.weentimeapp.seed;

import com.weentime.weentimeapp.client.UserServiceClient;
import com.weentime.weentimeapp.entity.Presence;
import com.weentime.weentimeapp.enums.PresenceSource;
import com.weentime.weentimeapp.enums.PresenceStatus;
import com.weentime.weentimeapp.repository.PresenceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@Order(1)
@RequiredArgsConstructor
@Slf4j
public class PresenceSeedData implements CommandLineRunner {

    private static final Random RANDOM = new Random(84);
    private static final LocalTime DEFAULT_START = LocalTime.of(9, 0);
    private static final LocalTime DEFAULT_END = LocalTime.of(17, 0);

    private static final Map<Long, List<String>> LOCATIONS = Map.of(
            5L, List.of("Siège TechCorp - Paris", "TechCorp Innovation Lab - Paris", "TechCorp Data Center - Lyon"),
            6L, List.of("Hôpital MediPlus - Paris", "Clinique MediPlus - Marseille", "Laboratoire MediPlus - Lyon"),
            7L, List.of("Bureau GreenEnergy - Nantes", "Parc Éolien GreenEnergy - Saint-Nazaire", "Centrale GreenEnergy - Rennes")
    );

    private static final List<String> FALLBACK_LOCATIONS = List.of("Siège - Paris", "Agence - Lyon", "Site - Nantes");

    private final UserServiceClient userServiceClient;
    private final PresenceRepository presenceRepository;

    @Override
    @Transactional
    public void run(String... args) {
        log.info("[SEED][PRESENCE] Démarrage…");

        List<Long> entrepriseIds = List.of(5L, 6L, 7L);

        for (Long entrepriseId : entrepriseIds) {
            List<Long> userIds;
            try {
                userIds = userServiceClient.findUserIdsByEntrepriseId(entrepriseId);
                log.info("[SEED][PRESENCE] Entreprise {} : {} utilisateurs trouvés", entrepriseId, userIds.size());
            } catch (Exception e) {
                log.warn("[SEED][PRESENCE] Impossible de récupérer les utilisateurs pour entrepriseId={} : {}",
                        entrepriseId, e.getMessage());
                continue;
            }

            List<Long> managerIds;
            try {
                managerIds = userServiceClient.findUserIdsByEntrepriseAndRole(entrepriseId, "MANAGER");
            } catch (Exception e) {
                log.warn("[SEED][PRESENCE] Impossible de récupérer les managers pour entrepriseId={}", entrepriseId);
                managerIds = List.of();
            }

            List<String> locations = LOCATIONS.getOrDefault(entrepriseId, FALLBACK_LOCATIONS);
            seedPresencesForEntreprise(entrepriseId, userIds, managerIds, locations);
        }

        log.info("[SEED][PRESENCE] Terminé.");
    }

    private void seedPresencesForEntreprise(Long entrepriseId, List<Long> userIds, List<Long> managerIds, List<String> locations) {
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = LocalDate.now();

        // Batch-load all existing (userId, date) pairs in one query
        Set<String> existingKeys;
        try {
            existingKeys = presenceRepository.findUtilisateurIdAndDateByUtilisateurIdIn(userIds)
                    .stream()
                    .map(row -> row[0] + ":" + row[1])
                    .collect(Collectors.toCollection(HashSet::new));
        } catch (Exception e) {
            log.warn("[SEED][PRESENCE] Erreur chargement existants pour entrepriseId={} : {}", entrepriseId, e.getMessage());
            existingKeys = new HashSet<>();
        }

        int totalCreated = 0;
        for (Long userId : userIds) {
            boolean isManager = managerIds.contains(userId);
            totalCreated += seedPresencesForUser(userId, entrepriseId, isManager, start, end, existingKeys, locations);
        }

        log.info("[SEED][PRESENCE] Entreprise {} : {} présences créées", entrepriseId, totalCreated);
    }

    private int seedPresencesForUser(Long userId, Long entrepriseId, boolean isManager,
                                     LocalDate start, LocalDate end, Set<String> existingKeys,
                                     List<String> locations) {
        int count = 0;
        LocalDate date = start;

        while (!date.isAfter(end)) {
            if (isWeekend(date)) {
                date = date.plusDays(1);
                continue;
            }

            if (existingKeys.contains(userId + ":" + date)) {
                date = date.plusDays(1);
                continue;
            }

            double roll = RANDOM.nextDouble();

            if (roll < 0.05) {
                count += createAbsence(userId, entrepriseId, date);
            } else if (roll < 0.13) {
                count += createLatePresence(userId, entrepriseId, date, isManager, locations);
            } else if (roll < 0.18) {
                count += createHalfDay(userId, entrepriseId, date, locations);
            } else if (roll < 0.25) {
                count += createRemotePresence(userId, entrepriseId, date, locations);
            } else if (roll < 0.35) {
                count += createOvertimePresence(userId, entrepriseId, date, isManager, locations);
            } else {
                count += createNormalPresence(userId, entrepriseId, date, isManager, locations);
            }

            date = date.plusDays(1);
        }

        return count;
    }

    private int createNormalPresence(Long userId, Long entrepriseId, LocalDate date, boolean isManager, List<String> locations) {
        int arriveMinute = isManager ? randInt(0, 15) : randInt(-15, 15);
        int leaveMinute = isManager ? randInt(-15, 0) : randInt(-15, 15);

        LocalTime arrive = DEFAULT_START.plusMinutes(arriveMinute);
        LocalTime leave = DEFAULT_END.plusMinutes(leaveMinute);

        double hours = ChronoUnit.MINUTES.between(arrive, leave) / 60.0;

        Presence p = Presence.builder()
                .utilisateurId(userId)
                .date(date)
                .heureEntree(date.atTime(arrive))
                .heureSortie(date.atTime(leave))
                .totalHeuresTravaillees(BigDecimal.valueOf(hours).setScale(2, BigDecimal.ROUND_HALF_UP))
                .status(PresenceStatus.PRESENT)
                .source(PresenceSource.WEB)
                .localisation(pickRandom(locations))
                .build();

        presenceRepository.save(p);
        return 1;
    }

    private int createOvertimePresence(Long userId, Long entrepriseId, LocalDate date, boolean isManager, List<String> locations) {
        int arriveMinute = isManager ? randInt(-15, 0) : randInt(-15, 15);
        int extraHours = randInt(1, 2);
        int extraMinutes = randInt(0, 59);

        LocalTime arrive = DEFAULT_START.plusMinutes(arriveMinute);
        LocalTime leave = DEFAULT_END.plusHours(extraHours).plusMinutes(extraMinutes);

        double hours = ChronoUnit.MINUTES.between(arrive, leave) / 60.0;

        Presence p = Presence.builder()
                .utilisateurId(userId)
                .date(date)
                .heureEntree(date.atTime(arrive))
                .heureSortie(date.atTime(leave))
                .totalHeuresTravaillees(BigDecimal.valueOf(hours).setScale(2, BigDecimal.ROUND_HALF_UP))
                .status(PresenceStatus.PRESENT)
                .source(PresenceSource.WEB)
                .localisation(pickRandom(locations))
                .build();

        presenceRepository.save(p);
        return 1;
    }

    private int createLatePresence(Long userId, Long entrepriseId, LocalDate date, boolean isManager, List<String> locations) {
        int lateMinutes = isManager ? randInt(15, 45) : randInt(15, 90);
        int leaveAfter = isManager ? randInt(0, 60) : randInt(-30, 30);

        LocalTime arrive = DEFAULT_START.plusMinutes(lateMinutes);
        LocalTime leave = DEFAULT_END.plusMinutes(leaveAfter);

        double hours = Math.max(4.0, ChronoUnit.MINUTES.between(arrive, leave) / 60.0);

        Presence p = Presence.builder()
                .utilisateurId(userId)
                .date(date)
                .heureEntree(date.atTime(arrive))
                .heureSortie(date.atTime(leave))
                .totalHeuresTravaillees(BigDecimal.valueOf(hours).setScale(2, BigDecimal.ROUND_HALF_UP))
                .status(PresenceStatus.LATE)
                .source(PresenceSource.WEB)
                .localisation(pickRandom(locations))
                .build();

        presenceRepository.save(p);
        return 1;
    }

    private int createHalfDay(Long userId, Long entrepriseId, LocalDate date, List<String> locations) {
        LocalTime arrive = DEFAULT_START.plusMinutes(randInt(-15, 30));
        LocalTime leave = LocalTime.of(13, 0).plusMinutes(randInt(0, 60));

        double hours = ChronoUnit.MINUTES.between(arrive, leave) / 60.0;

        Presence p = Presence.builder()
                .utilisateurId(userId)
                .date(date)
                .heureEntree(date.atTime(arrive))
                .heureSortie(date.atTime(leave))
                .totalHeuresTravaillees(BigDecimal.valueOf(hours).setScale(2, BigDecimal.ROUND_HALF_UP))
                .status(PresenceStatus.HALF_DAY)
                .source(PresenceSource.WEB)
                .localisation(pickRandom(locations))
                .build();

        presenceRepository.save(p);
        return 1;
    }

    private int createRemotePresence(Long userId, Long entrepriseId, LocalDate date, List<String> locations) {
        int arriveMinute = randInt(-30, 0);
        int leaveMinute = randInt(-30, 0);

        LocalTime arrive = DEFAULT_START.plusMinutes(arriveMinute);
        LocalTime leave = DEFAULT_END.plusMinutes(leaveMinute);

        double hours = ChronoUnit.MINUTES.between(arrive, leave) / 60.0;

        Presence p = Presence.builder()
                .utilisateurId(userId)
                .date(date)
                .heureEntree(date.atTime(arrive))
                .heureSortie(date.atTime(leave))
                .totalHeuresTravaillees(BigDecimal.valueOf(hours).setScale(2, BigDecimal.ROUND_HALF_UP))
                .status(PresenceStatus.REMOTE)
                .source(PresenceSource.MOBILE)
                .localisation("Domicile — " + pickRandom(locations).split(" - ")[0])
                .build();

        presenceRepository.save(p);
        return 1;
    }

    private int createAbsence(Long userId, Long entrepriseId, LocalDate date) {
        Presence p = Presence.builder()
                .utilisateurId(userId)
                .date(date)
                .totalHeuresTravaillees(BigDecimal.ZERO)
                .status(PresenceStatus.ABSENT)
                .source(PresenceSource.WEB)
                .localisation(null)
                .build();

        presenceRepository.save(p);
        return 1;
    }

    private boolean isWeekend(LocalDate date) {
        DayOfWeek d = date.getDayOfWeek();
        return d == DayOfWeek.SATURDAY || d == DayOfWeek.SUNDAY;
    }

    private int randInt(int min, int max) {
        return RANDOM.nextInt(max - min + 1) + min;
    }

    private String pickRandom(List<String> items) {
        return items.get(RANDOM.nextInt(items.size()));
    }
}
