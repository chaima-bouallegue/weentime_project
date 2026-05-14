package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeDocumentDTO;
import com.weentime.weentimeapp.entity.TypeDocument;
import com.weentime.weentimeapp.mapper.TypeDocumentMapper;
import com.weentime.weentimeapp.repository.TypeDocumentRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.TypeDocumentService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
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
        applyDefaults(entity);
        return mapper.toDto(repository.save(entity));
    }

    @Override
    @Transactional(readOnly = true)
    public TypeDocumentDTO getById(Long id) {
        Long entrepriseId = requireEntrepriseId();
        return repository.findById(id)
                .filter(entity -> canAccess(entity, entrepriseId))
                .map(mapper::toDto)
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found or access denied"));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TypeDocumentDTO> getAll() {
        Long entrepriseId = requireEntrepriseId();
        List<TypeDocument> typeDocuments = repository.findAllByEntrepriseId(entrepriseId).stream()
                .filter(this::isActive)
                .sorted(Comparator
                        .comparing((TypeDocument entity) -> entity.getEntrepriseId() == null)
                        .thenComparing(entity -> entity.getOrdre() == null ? 0 : entity.getOrdre())
                        .thenComparing(entity -> entity.getLibelle() == null ? "" : entity.getLibelle(), String.CASE_INSENSITIVE_ORDER))
                .toList();
        return mapper.toDtoList(typeDocuments);
    }

    @Override
    public TypeDocumentDTO update(Long id, TypeDocumentDTO dto) {
        Long entrepriseId = requireEntrepriseId();
        TypeDocument entity = repository.findById(id)
                .filter(existing -> canAccess(existing, entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found or access denied"));

        entity.setEntrepriseId(entrepriseId);
        entity.setLibelle(dto.getLibelle());
        entity.setCode(dto.getCode());
        if (dto.getCategorie() != null) entity.setCategorie(dto.getCategorie());
        if (dto.getDescription() != null) entity.setDescription(dto.getDescription());
        if (dto.getIcone() != null) entity.setIcone(dto.getIcone());
        if (dto.getOrdre() != null) entity.setOrdre(dto.getOrdre());
        if (dto.getActif() != null) entity.setActif(dto.getActif());

        if (dto.getModeGeneration() != null) entity.setModeGeneration(dto.getModeGeneration());
        if (dto.getContentTemplate() != null) entity.setContentTemplate(dto.getContentTemplate());
        if (dto.getAiPromptTemplate() != null) entity.setAiPromptTemplate(dto.getAiPromptTemplate());
        if (dto.getAiModel() != null) entity.setAiModel(dto.getAiModel());
        if (dto.getAiTemperature() != null) entity.setAiTemperature(dto.getAiTemperature());
        if (dto.getVariablesAutorisees() != null) entity.setVariablesAutorisees(dto.getVariablesAutorisees());
        if (dto.getLanguesDisponibles() != null) entity.setLanguesDisponibles(dto.getLanguesDisponibles());

        if (dto.getWorkflowType() != null) entity.setWorkflowType(dto.getWorkflowType());
        if (dto.getNiveauConfidentialite() != null) entity.setNiveauConfidentialite(dto.getNiveauConfidentialite());
        if (dto.getRequireSignature() != null) entity.setRequireSignature(dto.getRequireSignature());
        if (dto.getDelaiTraitementJours() != null) entity.setDelaiTraitementJours(dto.getDelaiTraitementJours());
        entity.setMaxDemandesParMois(dto.getMaxDemandesParMois());

        entity.setDureeValiditeJours(dto.getDureeValiditeJours());
        if (dto.getVersionning() != null) entity.setVersionning(dto.getVersionning());
        entity.setRetentionMois(dto.getRetentionMois());

        entity.setEnableTemplate(dto.getEnableTemplate());
        applyDefaults(entity);
        return mapper.toDto(repository.save(entity));
    }

    @Override
    public void delete(Long id) {
        Long entrepriseId = requireEntrepriseId();
        TypeDocument entity = repository.findById(id)
                .filter(existing -> canAccess(existing, entrepriseId))
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

    private boolean isActive(TypeDocument entity) {
        return entity != null && !Boolean.FALSE.equals(entity.getActif());
    }

    private void applyDefaults(TypeDocument entity) {
        if (entity.getModeGeneration() == null) entity.setModeGeneration("TEMPLATE_ONLY");
        if (entity.getAiModel() == null) entity.setAiModel("GEMINI_FLASH");
        if (entity.getAiTemperature() == null) entity.setAiTemperature(0.2f);
        if (entity.getWorkflowType() == null) entity.setWorkflowType("RH_VALIDATION");
        if (entity.getNiveauConfidentialite() == null) entity.setNiveauConfidentialite("PUBLIC");
        if (entity.getCategorie() == null) entity.setCategorie("ADMINISTRATIF");
        if (entity.getActif() == null) entity.setActif(true);
        if (entity.getLanguesDisponibles() == null) entity.setLanguesDisponibles("fr");
        if (entity.getDelaiTraitementJours() == null) entity.setDelaiTraitementJours(3);
        if (entity.getOrdre() == null) entity.setOrdre(0);
        if (entity.getRequireSignature() == null) entity.setRequireSignature(false);
        if (entity.getVersionning() == null) entity.setVersionning(false);
        if (entity.getEnableTemplate() == null) entity.setEnableTemplate(false);
    }
}
