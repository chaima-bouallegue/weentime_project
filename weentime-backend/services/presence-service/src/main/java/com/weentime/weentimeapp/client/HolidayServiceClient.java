package com.weentime.weentimeapp.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.time.LocalDate;

@FeignClient(name = "holiday-service", url = "${integration.holiday-service.url:${integration.leave-service.url}}")
public interface HolidayServiceClient {

    @GetMapping("/api/demandes/jours-feries/entreprise/{entrepriseId}/date/{date}")
    Boolean isPublicHoliday(
            @PathVariable("entrepriseId") Long entrepriseId,
            @PathVariable("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    );
}
