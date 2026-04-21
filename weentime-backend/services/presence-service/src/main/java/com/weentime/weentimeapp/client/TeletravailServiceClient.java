package com.weentime.weentimeapp.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.time.LocalDate;

@FeignClient(name = "rh-service-telework", url = "${integration.telework-service.url}")
public interface TeletravailServiceClient {

    @GetMapping("/api/demandes/teletravail/user/{userId}/date/{date}")
    Boolean hasApprovedTelework(
            @PathVariable("userId") Long userId,
            @PathVariable("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    );
}
