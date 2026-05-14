package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeDocumentDTO;
import com.weentime.weentimeapp.entity.TypeDocument;
import com.weentime.weentimeapp.mapper.TypeDocumentMapper;
import com.weentime.weentimeapp.repository.TypeDocumentRepository;
import com.weentime.weentimeapp.service.TypeDocumentService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.weentime.weentimeapp.security.SecurityUtils;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Transactional
public class TypeDocumentServiceImpl implements TypeDocumentService {

    private final TypeDocumentRepository repository;
    private final TypeDocumentMapper mapper;

    @Override
    public TypeDocumentDTO create(TypeDocumentDTO dto) {
        TypeDocument entity = mapper.toEntity(dto);
        entity.setEntrepriseId(requireEntrepriseId());
        return mapper.toDto(repository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeDocumentDTO getById(Long id) {
        Long entrepriseId = requireEntrepriseId();
        return repository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .map(mapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found or access denied"));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TypeDocumentDTO> getAll() {
        Long entrepriseId = requireEntrepriseId();
        return mapper.toDtoList(repository.findAllByEntrepriseId(entrepriseId));
    }

    @Override
    public TypeDocumentDTO update(Long id, TypeDocumentDTO dto) {
        Long entrepriseId = requireEntrepriseId();
        TypeDocument existingEntity = repository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found or access denied"));
        
        existingEntity.setLibelle(dto.getLibelle());
        existingEntity.setCode(dto.getCode());
        existingEntity.setRequireSignature(dto.getRequireSignature());
        existingEntity.setEnableTemplate(dto.getEnableTemplate());
        
        return mapper.toDto(repository.save(existingEntity));
    }

    @Override
    public void delete(Long id) {
        Long entrepriseId = requireEntrepriseId();
        TypeDocument entity = repository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found or access denied"));
        repository.delete(entity);
    }

    private Long requireEntrepriseId() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune entreprise associee a ce compte RH.");
        }
        return entrepriseId;
    }

    private boolean canAccess(TypeDocument entity, Long entrepriseId) {
        return entity != null && (Objects.equals(entity.getEntrepriseId(), entrepriseId) || entity.getEntrepriseId() == null);
    }
}
