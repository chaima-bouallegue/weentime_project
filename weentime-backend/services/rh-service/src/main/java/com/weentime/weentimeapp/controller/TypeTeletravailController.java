package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.entity.TypeTeletravail;
import com.weentime.weentimeapp.repository.TypeTeletravailRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/rh/type-teletravail")
@RequiredArgsConstructor
public class TypeTeletravailController {

    private final TypeTeletravailRepository repository;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH') or hasRole('MANAGER') or hasRole('EMPLOYEE')")
    public ResponseEntity<List<TypeTeletravail>> getAll() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        return ResponseEntity.ok(repository.findAllByEntrepriseId(entrepriseId));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH')")
    public ResponseEntity<TypeTeletravail> create(@RequestBody TypeTeletravail type) {
        type.setEntrepriseId(SecurityUtils.getCurrentEntrepriseId());
        return ResponseEntity.ok(repository.save(type));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH')")
    public ResponseEntity<TypeTeletravail> update(@PathVariable Long id, @RequestBody TypeTeletravail type) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        TypeTeletravail existing = repository.findById(id)
                .filter(t -> t.getEntrepriseId().equals(entrepriseId))
                .orElseThrow();
        
        existing.setLibelle(type.getLibelle());
        existing.setPeriode(type.getPeriode());
        existing.setActive(type.getActive());
        
        return ResponseEntity.ok(repository.save(existing));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        TypeTeletravail existing = repository.findById(id)
                .filter(t -> t.getEntrepriseId().equals(entrepriseId))
                .orElseThrow();
        repository.delete(existing);
        return ResponseEntity.noContent().build();
    }
}
