package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeDocumentDTO;
import com.weentime.weentimeapp.entity.TypeDocument;
import com.weentime.weentimeapp.mapper.TypeDocumentMapper;
import com.weentime.weentimeapp.repository.TypeDocumentRepository;
import com.weentime.weentimeapp.service.TypeDocumentService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class TypeDocumentServiceImpl implements TypeDocumentService {

    private final TypeDocumentRepository repository;
    private final TypeDocumentMapper mapper;

    @Override
    public TypeDocumentDTO create(TypeDocumentDTO dto) {
        TypeDocument entity = mapper.toEntity(dto);
        return mapper.toDto(repository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeDocumentDTO getById(Long id) {
        return repository.findById(id)
                .map(mapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found with id: " + id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TypeDocumentDTO> getAll() {
        return mapper.toDtoList(repository.findAll());
    }

    @Override
    public TypeDocumentDTO update(Long id, TypeDocumentDTO dto) {
        TypeDocument existingEntity = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found with id: " + id));
        
        existingEntity.setLibelle(dto.getLibelle());
        existingEntity.setCode(dto.getCode());
        existingEntity.setRequireSignature(dto.getRequireSignature());
        existingEntity.setEnableTemplate(dto.getEnableTemplate());
        
        return mapper.toDto(repository.save(existingEntity));
    }

    @Override
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new EntityNotFoundException("TypeDocument not found with id: " + id);
        }
        repository.deleteById(id);
    }
}
