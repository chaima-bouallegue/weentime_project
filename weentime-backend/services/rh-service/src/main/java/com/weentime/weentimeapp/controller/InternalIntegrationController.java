package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.entity.Conge;
import com.weentime.weentimeapp.entity.Teletravail;
import com.weentime.weentimeapp.repository.CongeRepository;
import com.weentime.weentimeapp.repository.JourFerieRepository;
import com.weentime.weentimeapp.repository.TeletravailRepository;
import com.weentime.weentimeapp.security.InternalAuthUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/demandes")
@RequiredArgsConstructor
@Slf4j
public class InternalIntegrationController {

    private final CongeRepository congeRepository;
    private final TeletravailRepository teletravailRepository;
    private final JourFerieRepository jourFerieRepository;

    @Value("${weentime.internal.secret:WeenTimeInternalSecretKey2026}")
    private String internalSecret;

    @GetMapping("/user/{userId}/date/{date}")
    public Boolean hasApprovedLeave(
            @PathVariable("userId") Long userId,
            @PathVariable("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = "X-Internal-Secret", required = false) String requestSecret) {
        if (!InternalAuthUtils.isInternalSecretValid(requestSecret, internalSecret)) {
            log.warn("Accès non autorisé à /api/demandes/user/{}/date/{}", userId, date);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal secret");
        }
        log.debug("Internal request: check approved leave for user {} on {}", userId, date);
        return congeRepository.findApprovedForUserAndDate(userId, date).isPresent();
    }

    @GetMapping("/teletravail/user/{userId}/date/{date}")
    public Boolean hasApprovedTelework(
            @PathVariable("userId") Long userId,
            @PathVariable("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = "X-Internal-Secret", required = false) String requestSecret) {
        if (!InternalAuthUtils.isInternalSecretValid(requestSecret, internalSecret)) {
            log.warn("Accès non autorisé à /api/demandes/teletravail/user/{}/date/{}", userId, date);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal secret");
        }
        log.debug("Internal request: check approved telework for user {} on {}", userId, date);
        return teletravailRepository.findApprovedForUserAndDate(userId, date).isPresent();
    }

    @GetMapping("/batch-status/leave")
    public List<Long> getUsersWithApprovedLeave(
            @RequestParam("entrepriseId") Long entrepriseId,
            @RequestParam("userIds") List<Long> userIds,
            @RequestParam("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = "X-Internal-Secret", required = false) String requestSecret) {
        if (!InternalAuthUtils.isInternalSecretValid(requestSecret, internalSecret)) {
            log.warn("Accès non autorisé à /api/demandes/batch-status/leave");
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal secret");
        }
        log.debug("Batch check approved leave for {} users on {}", userIds.size(), date);
        return congeRepository.findApprovedForUsersAndDateRange(entrepriseId, userIds, date, date)
                .stream()
                .map(Conge::getUtilisateurId)
                .distinct()
                .toList();
    }

    @GetMapping("/batch-status/teletravail")
    public List<Long> getUsersWithApprovedTelework(
            @RequestParam("entrepriseId") Long entrepriseId,
            @RequestParam("userIds") List<Long> userIds,
            @RequestParam("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = "X-Internal-Secret", required = false) String requestSecret) {
        if (!InternalAuthUtils.isInternalSecretValid(requestSecret, internalSecret)) {
            log.warn("Accès non autorisé à /api/demandes/batch-status/teletravail");
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal secret");
        }
        log.debug("Batch check approved telework for {} users on {}", userIds.size(), date);
        return teletravailRepository.findApprovedForUsersAndDateRange(entrepriseId, userIds, date, date)
                .stream()
                .map(Teletravail::getUtilisateurId)
                .distinct()
                .toList();
    }

    @GetMapping("/jours-feries/entreprise/{entrepriseId}/date/{date}")
    public Boolean isPublicHoliday(
            @PathVariable("entrepriseId") Long entrepriseId,
            @PathVariable("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = "X-Internal-Secret", required = false) String requestSecret) {
        if (!InternalAuthUtils.isInternalSecretValid(requestSecret, internalSecret)) {
            log.warn("Accès non autorisé à /api/demandes/jours-feries/entreprise/{}/date/{}", entrepriseId, date);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal secret");
        }
        log.debug("Internal request: check public holiday for enterprise {} on {}", entrepriseId, date);
        return !jourFerieRepository.findByDateAndEntrepriseId(date, entrepriseId).isEmpty();
    }
}
