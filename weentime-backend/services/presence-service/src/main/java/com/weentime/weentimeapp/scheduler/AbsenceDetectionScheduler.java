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
}
