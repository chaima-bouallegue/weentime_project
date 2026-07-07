package com.weentime.weentimeproject.controller;


import com.weentime.weentimeproject.dto.request.DepartementRequest;
import com.weentime.weentimeproject.dto.response.DepartementResponse;
import com.weentime.weentimeproject.pagination.PageParams;
import com.weentime.weentimeproject.service.DepartementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/organisations/departements")
@RequiredArgsConstructor
public class DepartementController {

    private final DepartementService departementService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<DepartementResponse> createDepartement(
            @Valid @RequestBody DepartementRequest request) {
        return new ResponseEntity<>(
                departementService.createDepartement(request),
                HttpStatus.CREATED
        );
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH', 'MANAGER')")
    public ResponseEntity<DepartementResponse> getDepartementById(
            @PathVariable Long id) {
        return ResponseEntity.ok(departementService.getDepartementById(id));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RH', 'MANAGER')")
    public ResponseEntity<Page<DepartementResponse>> getAllDepartements(
            @ModelAttribute PageParams params) {
        return ResponseEntity.ok(departementService.getAllDepartements(params.toPageable()));
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<DepartementResponse> updateDepartement(
            @PathVariable Long id,
            @RequestBody DepartementRequest request) {
        return ResponseEntity.ok(departementService.updateDepartement(id, request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<DepartementResponse> replaceDepartement(
            @PathVariable Long id,
            @RequestBody DepartementRequest request) {
        return updateDepartement(id, request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<Void> deleteDepartement(@PathVariable Long id) {
        departementService.deleteDepartement(id);
        return ResponseEntity.noContent().build();
    }
}
