package com.weentime.weentimeapp.scheduler;

import com.weentime.weentimeapp.service.PresenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class AbsenceDetectionScheduler {

    private final PresenceService presenceService;

    // Run every day at 23:55
    @Scheduled(cron = "0 55 23 * * *")
    public void runAbsenceDetection() {
        log.info("Starting scheduled absence detection...");
        presenceService.detectAbsences();
        log.info("Finished scheduled absence detection.");
    }

    @Scheduled(fixedDelayString = "${presence.auto-close-fixed-delay-ms:900000}")
    public void runAutomaticCheckout() {
        log.debug("Starting scheduled automatic checkout sweep...");
        presenceService.autoCloseOpenSessions();
        log.debug("Finished scheduled automatic checkout sweep.");
    }

    @Scheduled(fixedDelayString = "${presence.missing-checkin-fixed-delay-ms:900000}")
    public void runMissingCheckInDetection() {
        log.debug("Starting scheduled missing check-in detection...");
        presenceService.detectMissingCheckIns();
        log.debug("Finished scheduled missing check-in detection.");
    }
}
