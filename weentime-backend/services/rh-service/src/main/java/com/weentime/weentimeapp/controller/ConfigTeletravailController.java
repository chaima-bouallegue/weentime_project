package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.entity.ConfigTeletravail;
import com.weentime.weentimeapp.service.ConfigTeletravailService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/rh/config-teletravail")
@RequiredArgsConstructor
public class ConfigTeletravailController {

    private final ConfigTeletravailService service;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH') or hasRole('MANAGER') or hasRole('EMPLOYEE')")
    public ResponseEntity<ConfigTeletravail> getConfig() {
        return ResponseEntity.ok(service.getConfig());
    }

    @PutMapping
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH')")
    public ResponseEntity<ConfigTeletravail> updateConfig(@RequestBody ConfigTeletravail config) {
        return ResponseEntity.ok(service.updateConfig(config));
    }
}
