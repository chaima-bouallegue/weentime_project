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

        // Valeurs par défaut si non fournies
        if (entity.getModeGeneration() == null) entity.setModeGeneration("TEMPLATE_ONLY");
        if (entity.getAiModel() == null) entity.setAiModel("GEMINI_FLASH");
        if (entity.getAiTemperature() == null) entity.setAiTemperature(0.2f);
        if (entity.getWorkflowType() == null) entity.setWorkflowType("RH_VALIDATION");
        if (entity.getNiveauConfidentialite() == null) entity.setNiveauConfidentialite("PUBLIC");
        if (entity.getCategorie() == null) entity.setCategorie("ADMINISTRATIF");
        if (entity.getActif() == null) entity.setActif(true);
        if (entity.getLanguesDisponibles() == null) entity.setLanguesDisponibles("fr");
        if (entity.getDelaiTraitementJours() == null) entity.setDelaiTraitementJours(3);

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
        return mapper.toDtoList(repository.findByEntrepriseIdAndActifTrueOrderByOrdreAsc(entrepriseId));
    }

    @Override
    public TypeDocumentDTO update(Long id, TypeDocumentDTO dto) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        TypeDocument entity = repository.findById(id)
                .filter(t -> t.getEntrepriseId().equals(entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeDocument not found or access denied"));

        // Section A : Identité
        entity.setLibelle(dto.getLibelle());
        entity.setCode(dto.getCode());
        if (dto.getCategorie() != null) entity.setCategorie(dto.getCategorie());
        if (dto.getDescription() != null) entity.setDescription(dto.getDescription());
        if (dto.getIcone() != null) entity.setIcone(dto.getIcone());
        if (dto.getOrdre() != null) entity.setOrdre(dto.getOrdre());
        if (dto.getActif() != null) entity.setActif(dto.getActif());

        // Section B : Génération
        if (dto.getModeGeneration() != null) entity.setModeGeneration(dto.getModeGeneration());
        if (dto.getContentTemplate() != null) entity.setContentTemplate(dto.getContentTemplate());
        if (dto.getAiPromptTemplate() != null) entity.setAiPromptTemplate(dto.getAiPromptTemplate());
        if (dto.getAiModel() != null) entity.setAiModel(dto.getAiModel());
        if (dto.getAiTemperature() != null) entity.setAiTemperature(dto.getAiTemperature());
        if (dto.getVariablesAutorisees() != null) entity.setVariablesAutorisees(dto.getVariablesAutorisees());
        if (dto.getLanguesDisponibles() != null) entity.setLanguesDisponibles(dto.getLanguesDisponibles());

        // Section C : Workflow
        if (dto.getWorkflowType() != null) entity.setWorkflowType(dto.getWorkflowType());
        if (dto.getNiveauConfidentialite() != null) entity.setNiveauConfidentialite(dto.getNiveauConfidentialite());
        if (dto.getRequireSignature() != null) entity.setRequireSignature(dto.getRequireSignature());
        if (dto.getDelaiTraitementJours() != null) entity.setDelaiTraitementJours(dto.getDelaiTraitementJours());
        entity.setMaxDemandesParMois(dto.getMaxDemandesParMois());

        // Section D : Cycle de vie
        entity.setDureeValiditeJours(dto.getDureeValiditeJours());
        if (dto.getVersionning() != null) entity.setVersionning(dto.getVersionning());
        entity.setRetentionMois(dto.getRetentionMois());

        // Legacy
        entity.setEnableTemplate(dto.getEnableTemplate());

        return mapper.toDto(repository.save(entity));
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
