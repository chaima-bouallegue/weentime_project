package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeAbsenceDTO;
import com.weentime.weentimeapp.entity.TypeAbsence;
import com.weentime.weentimeapp.mapper.TypeAbsenceMapper;
import com.weentime.weentimeapp.repository.TypeAbsenceRepository;
import com.weentime.weentimeapp.service.TypeAbsenceService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
@SuppressWarnings("null")
public class TypeAbsenceServiceImpl implements TypeAbsenceService {

    private final TypeAbsenceRepository typeAbsenceRepository;
    private final TypeAbsenceMapper typeAbsenceMapper;

    @Override
    public TypeAbsenceDTO create(TypeAbsenceDTO dto) {
        TypeAbsence entity = typeAbsenceMapper.toEntity(dto);
        return typeAbsenceMapper.toDto(typeAbsenceRepository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeAbsenceDTO getById(Long id) {
        return typeAbsenceRepository.findById(id)
                .map(typeAbsenceMapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeAbsence not found"));
    }

    @Override
    public List<TypeAbsenceDTO> getAll() {
        return typeAbsenceMapper.toDtoList(typeAbsenceRepository.findAll());
    }

    @Override
    public TypeAbsenceDTO update(Long id, TypeAbsenceDTO dto) {
        TypeAbsence entity = typeAbsenceRepository.findById(id).orElseThrow();
        entity.setLibelle(dto.getLibelle());
        entity.setType(dto.getType());
        entity.setNombreJoursMax(dto.getNombreJoursMax());
        entity.setDecompteJours(dto.getDecompteJours());
        entity.setRequireJustificatif(dto.getRequireJustificatif());
        return typeAbsenceMapper.toDto(typeAbsenceRepository.save(entity));
    }

    @Override
    public void delete(Long id) {
        typeAbsenceRepository.deleteById(id);
    }
}
