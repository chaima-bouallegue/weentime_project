package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeCongeDTO;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.mapper.TypeCongeMapper;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.TypeCongeService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

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
        entity.setEntrepriseId(requireEntrepriseId());
        return typeCongeMapper.toDto(typeCongeRepository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeCongeDTO getById(Long id) {
        Long entrepriseId = requireEntrepriseId();
        return typeCongeRepository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .map(typeCongeMapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeConge not found or access denied"));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TypeCongeDTO> getAll() {
        Long entrepriseId = requireEntrepriseId();
        return typeCongeMapper.toDtoList(typeCongeRepository.findAllByEntrepriseId(entrepriseId));
    }

    @Override
    public TypeCongeDTO update(Long id, TypeCongeDTO dto) {
        Long entrepriseId = requireEntrepriseId();
        TypeConge entity = typeCongeRepository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeConge not found or access denied"));

        entity.setLibelle(dto.getLibelle());
        entity.setNombreJoursMax(dto.getNombreJoursMax());
        entity.setDecompteJours(dto.getDecompteJours());
        entity.setRequireJustificatif(dto.getRequireJustificatif());
        return typeCongeMapper.toDto(typeCongeRepository.save(entity));
    }

    @Override
    public void delete(Long id) {
        Long entrepriseId = requireEntrepriseId();
        TypeConge entity = typeCongeRepository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeConge not found or access denied"));
        typeCongeRepository.delete(entity);
    }

    private Long requireEntrepriseId() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune entreprise associee a ce compte RH.");
        }
        return entrepriseId;
    }

    private boolean canAccess(TypeConge entity, Long entrepriseId) {
        return entity != null && (Objects.equals(entity.getEntrepriseId(), entrepriseId) || entity.getEntrepriseId() == null);
    }
}
