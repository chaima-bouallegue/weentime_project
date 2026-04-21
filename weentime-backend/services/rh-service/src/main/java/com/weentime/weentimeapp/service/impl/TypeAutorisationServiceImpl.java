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
        return mapper.toDto(repository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeAutorisationDTO getById(Long id) {
        return repository.findById(id)
                .map(mapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeAutorisation not found with id: " + id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TypeAutorisationDTO> getAll() {
        return mapper.toDtoList(repository.findAll());
    }

    @Override
    public TypeAutorisationDTO update(Long id, TypeAutorisationDTO dto) {
        TypeAutorisation existingEntity = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("TypeAutorisation not found with id: " + id));
        
        existingEntity.setLibelle(dto.getLibelle());
        existingEntity.setMaxHeuresMois(dto.getMaxHeuresMois());
        existingEntity.setRequireJustificatif(dto.getRequireJustificatif());
        
        return mapper.toDto(repository.save(existingEntity));
    }

    @Override
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new EntityNotFoundException("TypeAutorisation not found with id: " + id);
        }
        repository.deleteById(id);
    }
}
