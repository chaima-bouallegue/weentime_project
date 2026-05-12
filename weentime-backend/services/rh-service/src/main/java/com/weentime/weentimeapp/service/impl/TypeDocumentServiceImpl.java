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

import com.weentime.weentimeapp.security.SecurityUtils;
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
        entity.setEntrepriseId(SecurityUtils.getCurrentEntrepriseId());
        return mapper.toDto(repository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeDocumentDTO getById(Long id) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        return repository.findById(id)
                .filter(t -> t.getEntrepriseId().equals(entrepriseId))
                .map(mapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found or access denied"));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TypeDocumentDTO> getAll() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        return mapper.toDtoList(repository.findAllByEntrepriseId(entrepriseId));
    }

    @Override
    public TypeDocumentDTO update(Long id, TypeDocumentDTO dto) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        TypeDocument existingEntity = repository.findById(id)
                .filter(t -> t.getEntrepriseId().equals(entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found or access denied"));
        
        existingEntity.setLibelle(dto.getLibelle());
        existingEntity.setCode(dto.getCode());
        existingEntity.setRequireSignature(dto.getRequireSignature());
        existingEntity.setEnableTemplate(dto.getEnableTemplate());
        
        return mapper.toDto(repository.save(existingEntity));
    }

    @Override
    public void delete(Long id) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        TypeDocument entity = repository.findById(id)
                .filter(t -> t.getEntrepriseId().equals(entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found or access denied"));
        repository.delete(entity);
    }
}
