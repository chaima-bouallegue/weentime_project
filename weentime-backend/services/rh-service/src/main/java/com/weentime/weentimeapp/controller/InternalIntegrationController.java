package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.repository.CongeRepository;
import com.weentime.weentimeapp.repository.TeletravailRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/demandes")
@RequiredArgsConstructor
@Slf4j
public class InternalIntegrationController {

    private final CongeRepository congeRepository;
    private final TeletravailRepository teletravailRepository;

    @GetMapping("/user/{userId}/date/{date}")
    public Boolean hasApprovedLeave(
            @PathVariable("userId") Long userId,
            @PathVariable("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        log.debug("Internal request: check approved leave for user {} on {}", userId, date);
        return congeRepository.findApprovedForUserAndDate(userId, date).isPresent();
    }

    @GetMapping("/teletravail/user/{userId}/date/{date}")
    public Boolean hasApprovedTelework(
            @PathVariable("userId") Long userId,
            @PathVariable("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        log.debug("Internal request: check approved telework for user {} on {}", userId, date);
        return teletravailRepository.findApprovedForUserAndDate(userId, date).isPresent();
    }
}
