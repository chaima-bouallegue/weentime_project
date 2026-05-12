package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.entity.JourFerie;
import com.weentime.weentimeapp.service.JourFerieService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/rh/jours-feries")
@RequiredArgsConstructor
public class JourFerieController {

    private final JourFerieService service;

    @GetMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE', 'MANAGER', 'RH')")
    public ResponseEntity<List<JourFerie>> getAll() {
        return ResponseEntity.ok(service.getAllForCurrentEntreprise());
    }

    @GetMapping("/range")
    @PreAuthorize("hasAnyRole('EMPLOYEE', 'MANAGER', 'RH')")
    public ResponseEntity<List<JourFerie>> getRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end
    ) {
        return ResponseEntity.ok(service.getForRange(start, end));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('EMPLOYEE', 'MANAGER', 'RH')")
    public ResponseEntity<JourFerie> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<JourFerie> create(@RequestBody JourFerie jourFerie) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(jourFerie));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<JourFerie> update(@PathVariable Long id, @RequestBody JourFerie jourFerie) {
        return ResponseEntity.ok(service.update(id, jourFerie));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/check/{date}")
    @PreAuthorize("hasAnyRole('EMPLOYEE', 'MANAGER', 'RH')")
    public ResponseEntity<Boolean> check(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(service.isJourFerie(date));
    }
}
