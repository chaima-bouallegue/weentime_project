package com.weentime.weentimeapp.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class RhServiceFeignClientWrapper {

    private final LeaveServiceClient leaveServiceClient;
    private final TeletravailServiceClient teletravailServiceClient;
    private final HolidayServiceClient holidayServiceClient;

    // ── Individuels ──

    @CircuitBreaker(name = "rhServiceClient", fallbackMethod = "hasApprovedLeaveFallback")
    public Boolean callHasApprovedLeave(Long userId, LocalDate date) {
        return leaveServiceClient.hasApprovedLeave(userId, date);
    }

    private Boolean hasApprovedLeaveFallback(Long userId, LocalDate date, Throwable t) {
        log.warn("Fallback: leave check unavailable for user {} on {}: {}", userId, date, t.getMessage());
        return false;
    }

    @CircuitBreaker(name = "rhServiceClient", fallbackMethod = "hasApprovedTeleworkFallback")
    public Boolean callHasApprovedTelework(Long userId, LocalDate date) {
        return teletravailServiceClient.hasApprovedTelework(userId, date);
    }

    private Boolean hasApprovedTeleworkFallback(Long userId, LocalDate date, Throwable t) {
        log.warn("Fallback: telework check unavailable for user {} on {}: {}", userId, date, t.getMessage());
        return false;
    }

    @CircuitBreaker(name = "rhServiceClient", fallbackMethod = "isPublicHolidayFallback")
    public Boolean callIsPublicHoliday(Long entrepriseId, LocalDate date) {
        return holidayServiceClient.isPublicHoliday(entrepriseId, date);
    }

    private Boolean isPublicHolidayFallback(Long entrepriseId, LocalDate date, Throwable t) {
        log.warn("Fallback: holiday check unavailable for enterprise {} on {}: {}", entrepriseId, date, t.getMessage());
        return false;
    }

    // ── Batch ──

    @CircuitBreaker(name = "rhServiceClient", fallbackMethod = "getUsersWithApprovedLeaveFallback")
    public List<Long> callGetUsersWithApprovedLeave(Long entrepriseId, List<Long> userIds, LocalDate date) {
        return leaveServiceClient.getUsersWithApprovedLeave(entrepriseId, userIds, date);
    }

    private List<Long> getUsersWithApprovedLeaveFallback(Long entrepriseId, List<Long> userIds, LocalDate date, Throwable t) {
        log.warn("Fallback: batch leave unavailable for enterprise {} on {}: {}", entrepriseId, date, t.getMessage());
        return List.of();
    }

    @CircuitBreaker(name = "rhServiceClient", fallbackMethod = "getUsersWithApprovedTeleworkFallback")
    public List<Long> callGetUsersWithApprovedTelework(Long entrepriseId, List<Long> userIds, LocalDate date) {
        return teletravailServiceClient.getUsersWithApprovedTelework(entrepriseId, userIds, date);
    }

    private List<Long> getUsersWithApprovedTeleworkFallback(Long entrepriseId, List<Long> userIds, LocalDate date, Throwable t) {
        log.warn("Fallback: batch telework unavailable for enterprise {} on {}: {}", entrepriseId, date, t.getMessage());
        return List.of();
    }
}
