package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeAutorisationDTO;
import com.weentime.weentimeapp.entity.TypeAutorisation;
import com.weentime.weentimeapp.mapper.TypeAutorisationMapper;
import com.weentime.weentimeapp.repository.TypeAutorisationRepository;
import com.weentime.weentimeapp.service.TypeAutorisationService;
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
public class TypeAutorisationServiceImpl implements TypeAutorisationService {

    private final TypeAutorisationRepository repository;
    private final TypeAutorisationMapper mapper;

    @Override
    public TypeAutorisationDTO create(TypeAutorisationDTO dto) {
        TypeAutorisation entity = mapper.toEntity(dto);
        entity.setEntrepriseId(requireEntrepriseId());
        return mapper.toDto(repository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeAutorisationDTO getById(Long id) {
        Long entrepriseId = requireEntrepriseId();
        return repository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .map(mapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeAutorisation not found or access denied"));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TypeAutorisationDTO> getAll() {
        Long entrepriseId = requireEntrepriseId();
        return mapper.toDtoList(repository.findAllByEntrepriseId(entrepriseId));
    }

    @Override
    public TypeAutorisationDTO update(Long id, TypeAutorisationDTO dto) {
        Long entrepriseId = requireEntrepriseId();
        TypeAutorisation existingEntity = repository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeAutorisation not found or access denied"));
        
        existingEntity.setLibelle(dto.getLibelle());
        existingEntity.setMaxHeuresMois(dto.getMaxHeuresMois());
        existingEntity.setRequireJustificatif(dto.getRequireJustificatif());
        
        return mapper.toDto(repository.save(existingEntity));
    }

    @Override
    public void delete(Long id) {
        Long entrepriseId = requireEntrepriseId();
        TypeAutorisation entity = repository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeAutorisation not found or access denied"));
        repository.delete(entity);
    }

    private Long requireEntrepriseId() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune entreprise associee a ce compte RH.");
        }
        return entrepriseId;
    }

    private boolean canAccess(TypeAutorisation entity, Long entrepriseId) {
        return entity != null && (Objects.equals(entity.getEntrepriseId(), entrepriseId) || entity.getEntrepriseId() == null);
    }
}
