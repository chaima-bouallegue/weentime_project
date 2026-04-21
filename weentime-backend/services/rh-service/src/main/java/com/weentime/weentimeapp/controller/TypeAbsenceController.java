package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.service.TypeAbsenceService;
import com.weentime.weentimeapp.dto.TypeAbsenceDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/rh/type-absences")
@RequiredArgsConstructor
public class TypeAbsenceController {

    private final TypeAbsenceService service;

    // 🔹 CREATE
    @PostMapping
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<TypeAbsenceDTO> create(@RequestBody TypeAbsenceDTO dto) {
        return ResponseEntity.ok(service.create(dto));
    }

    // 🔹 GET ALL
    @GetMapping
    @PreAuthorize("hasRole('RH') or hasRole('MANAGER')")
    public ResponseEntity<List<TypeAbsenceDTO>> getAll() {
        return ResponseEntity.ok(service.getAll());
    }

    // 🔹 GET BY ID
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('RH') or hasRole('MANAGER')")
    public ResponseEntity<TypeAbsenceDTO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    // 🔹 UPDATE
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<TypeAbsenceDTO> update(
            @PathVariable Long id,
            @RequestBody TypeAbsenceDTO dto) {

        return ResponseEntity.ok(service.update(id, dto));
    }

    // 🔹 DELETE
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('RH')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}