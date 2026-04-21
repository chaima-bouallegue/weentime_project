package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeCongeDTO;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.mapper.TypeCongeMapper;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.service.TypeCongeService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
@SuppressWarnings("null")
public class TypeCongeServiceImpl implements TypeCongeService {

    private final TypeCongeRepository typeCongeRepository;
    private final TypeCongeMapper typeCongeMapper;

    @Override
    public TypeCongeDTO create(TypeCongeDTO dto) {
        TypeConge entity = typeCongeMapper.toEntity(dto);
        return typeCongeMapper.toDto(typeCongeRepository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeCongeDTO getById(Long id) {
        return typeCongeRepository.findById(id)
                .map(typeCongeMapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeConge not found"));
    }

    @Override
    public List<TypeCongeDTO> getAll() {
        return typeCongeMapper.toDtoList(typeCongeRepository.findAll());
    }

    @Override
    public TypeCongeDTO update(Long id, TypeCongeDTO dto) {
        TypeConge entity = typeCongeRepository.findById(id).orElseThrow();
        entity.setLibelle(dto.getLibelle());
        entity.setNombreJoursMax(dto.getNombreJoursMax());
        entity.setDecompteJours(dto.getDecompteJours());
        entity.setRequireJustificatif(dto.getRequireJustificatif());
        return typeCongeMapper.toDto(typeCongeRepository.save(entity));
    }

    @Override
    public void delete(Long id) {
        typeCongeRepository.deleteById(id);
    }
}
