package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeAutorisationDTO;
import com.weentime.weentimeapp.entity.TypeAutorisation;
import com.weentime.weentimeapp.mapper.TypeAutorisationMapper;
import com.weentime.weentimeapp.repository.TypeAutorisationRepository;
import com.weentime.weentimeapp.service.TypeAutorisationService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.weentime.weentimeapp.security.SecurityUtils;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class TypeAutorisationServiceImpl implements TypeAutorisationService {

    private final TypeAutorisationRepository repository;
    private final TypeAutorisationMapper mapper;

    @Override
    public TypeAutorisationDTO create(TypeAutorisationDTO dto) {
        TypeAutorisation entity = mapper.toEntity(dto);
        entity.setEntrepriseId(SecurityUtils.getCurrentEntrepriseId());
        return mapper.toDto(repository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeAutorisationDTO getById(Long id) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        return repository.findById(id)
                .filter(t -> t.getEntrepriseId().equals(entrepriseId))
                .map(mapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeAutorisation not found or access denied"));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TypeAutorisationDTO> getAll() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        return mapper.toDtoList(repository.findAllByEntrepriseId(entrepriseId));
    }

    @Override
    public TypeAutorisationDTO update(Long id, TypeAutorisationDTO dto) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        TypeAutorisation existingEntity = repository.findById(id)
                .filter(t -> t.getEntrepriseId().equals(entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeAutorisation not found or access denied"));
        
        existingEntity.setLibelle(dto.getLibelle());
        existingEntity.setMaxHeuresMois(dto.getMaxHeuresMois());
        existingEntity.setRequireJustificatif(dto.getRequireJustificatif());
        
        return mapper.toDto(repository.save(existingEntity));
    }

    @Override
    public void delete(Long id) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        TypeAutorisation entity = repository.findById(id)
                .filter(t -> t.getEntrepriseId().equals(entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeAutorisation not found or access denied"));
        repository.delete(entity);
    }
}
