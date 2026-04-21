package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.TypeDocumentDTO;
import com.weentime.weentimeapp.service.TypeDocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/rh/parametres/types-documents")
@RequiredArgsConstructor
public class TypeDocumentController {

    private final TypeDocumentService typeDocumentService;

    @PostMapping
    public ResponseEntity<TypeDocumentDTO> createTypeDocument(@RequestBody TypeDocumentDTO dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(typeDocumentService.create(dto));
    }

    @GetMapping("/{id}")
    public ResponseEntity<TypeDocumentDTO> getTypeDocumentById(@PathVariable Long id) {
        return ResponseEntity.ok(typeDocumentService.getById(id));
    }

    @GetMapping
    public ResponseEntity<List<TypeDocumentDTO>> getAllTypeDocuments() {
        return ResponseEntity.ok(typeDocumentService.getAll());
    }

    @PutMapping("/{id}")
    public ResponseEntity<TypeDocumentDTO> updateTypeDocument(@PathVariable Long id, @RequestBody TypeDocumentDTO dto) {
        return ResponseEntity.ok(typeDocumentService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTypeDocument(@PathVariable Long id) {
        typeDocumentService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
