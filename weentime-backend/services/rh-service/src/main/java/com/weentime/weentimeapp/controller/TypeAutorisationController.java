package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.TypeAutorisationDTO;
import com.weentime.weentimeapp.service.TypeAutorisationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/rh/parametres/types-autorisations")
@RequiredArgsConstructor
public class TypeAutorisationController {

    private final TypeAutorisationService typeAutorisationService;

    @PostMapping
    public ResponseEntity<TypeAutorisationDTO> createTypeAutorisation(@RequestBody TypeAutorisationDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(typeAutorisationService.create(dto));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH') or hasRole('MANAGER') or hasRole('EMPLOYEE')")
    public ResponseEntity<TypeAutorisationDTO> getTypeAutorisationById(@PathVariable Long id) {
        return ResponseEntity.ok(typeAutorisationService.getById(id));
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH') or hasRole('MANAGER') or hasRole('EMPLOYEE')")
    public ResponseEntity<List<TypeAutorisationDTO>> getAllTypeAutorisations() {
        return ResponseEntity.ok(typeAutorisationService.getAll());
    }

    @PutMapping("/{id}")
    public ResponseEntity<TypeAutorisationDTO> updateTypeAutorisation(@PathVariable Long id, @RequestBody TypeAutorisationDTO dto) {
        return ResponseEntity.ok(typeAutorisationService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTypeAutorisation(@PathVariable Long id) {
        typeAutorisationService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
