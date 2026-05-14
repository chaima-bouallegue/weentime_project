package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.service.TypeCongeService;
import com.weentime.weentimeapp.dto.TypeCongeDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/rh/type-conges")
@RequiredArgsConstructor
public class TypeCongeController {

    private final TypeCongeService service;

    @PostMapping
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH') or hasRole('MANAGER')")
    public ResponseEntity<TypeCongeDTO> create(@RequestBody TypeCongeDTO dto) {
        return ResponseEntity.ok(service.create(dto));
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH') or hasRole('MANAGER') or hasRole('EMPLOYEE')")
    public ResponseEntity<?> getAll(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size
    ) {
        List<TypeCongeDTO> items = service.getAll();
        if (page == null && size == null) {
            return ResponseEntity.ok(items);
        }
        return ResponseEntity.ok(ApiResponse.success(toPage(items, page, size)));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH') or hasRole('MANAGER') or hasRole('EMPLOYEE')")
    public ResponseEntity<TypeCongeDTO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(id));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH') or hasRole('MANAGER')")
    public ResponseEntity<TypeCongeDTO> update(
            @PathVariable Long id,
            @RequestBody TypeCongeDTO dto) {
        return ResponseEntity.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN') or hasRole('RH') or hasRole('MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    private PageResponse<TypeCongeDTO> toPage(List<TypeCongeDTO> source, Integer page, Integer size) {
        int safePage = page == null ? 0 : Math.max(page, 0);
        int safeSize = size == null ? 100 : Math.max(size, 1);
        int start = Math.min(safePage * safeSize, source.size());
        int end = Math.min(start + safeSize, source.size());

        return PageResponse.<TypeCongeDTO>builder()
                .content(source.subList(start, end))
                .totalElements(source.size())
                .totalPages((int) Math.ceil((double) source.size() / safeSize))
                .number(safePage)
                .size(safeSize)
                .build();
    }
}
