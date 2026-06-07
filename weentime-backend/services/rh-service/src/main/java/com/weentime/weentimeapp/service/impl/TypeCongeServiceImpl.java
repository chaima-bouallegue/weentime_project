package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.TypeCongeDTO;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.mapper.TypeCongeMapper;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.security.SecurityUtils;
import com.weentime.weentimeapp.service.TypeCongeService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Transactional
@SuppressWarnings("null")
@Slf4j
public class TypeCongeServiceImpl implements TypeCongeService {

    private static final int MAX_LIBELLE_LENGTH = 150;
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private final TypeCongeRepository typeCongeRepository;
    private final TypeCongeMapper typeCongeMapper;

    @Override
    public TypeCongeDTO create(TypeCongeDTO dto) {
        Long entrepriseId = requireEntrepriseId();
        normalizeAndValidate(dto);
        rejectDuplicateLibelle(dto.getLibelle(), entrepriseId, null);

        TypeConge entity = typeCongeMapper.toEntity(dto);
        if (entity == null) {
            log.error("TypeConge mapping returned null for entrepriseId={}", entrepriseId);
            throw new IllegalStateException("Impossible de preparer le type de conge.");
        }
        entity.setEntrepriseId(entrepriseId);
        entity.setLibelle(dto.getLibelle());
        entity.setNombreJoursMax(dto.getNombreJoursMax());
        entity.setDecompteJours(dto.getDecompteJours());
        entity.setRequireJustificatif(dto.getRequireJustificatif());

        try {
            TypeConge saved = typeCongeRepository.saveAndFlush(entity);
            log.info("TypeConge created: id={}, entrepriseId={}, libelle={}",
                    saved.getId(), entrepriseId, saved.getLibelle());
            return typeCongeMapper.toDto(saved);
        } catch (DataIntegrityViolationException ex) {
            if (isUniqueViolation(ex)) {
                log.warn("TypeConge database conflict: entrepriseId={}, libelle={}, cause={}",
                        entrepriseId, dto.getLibelle(), mostSpecificMessage(ex));
                throw conflict(dto.getLibelle(), ex);
            }
            log.error("TypeConge persistence failed: entrepriseId={}, libelle={}, cause={}",
                    entrepriseId, dto.getLibelle(), mostSpecificMessage(ex), ex);
            throw ex;
        }
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
        normalizeAndValidate(dto);
        TypeConge entity = typeCongeRepository.findById(id)
                .filter(t -> canAccess(t, entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("TypeConge not found or access denied"));

        rejectDuplicateLibelle(dto.getLibelle(), entrepriseId, id);
        entity.setLibelle(dto.getLibelle());
        entity.setNombreJoursMax(dto.getNombreJoursMax());
        entity.setDecompteJours(dto.getDecompteJours());
        entity.setRequireJustificatif(dto.getRequireJustificatif());
        try {
            TypeConge saved = typeCongeRepository.saveAndFlush(entity);
            log.info("TypeConge updated: id={}, entrepriseId={}, libelle={}",
                    saved.getId(), entrepriseId, saved.getLibelle());
            return typeCongeMapper.toDto(saved);
        } catch (DataIntegrityViolationException ex) {
            if (isUniqueViolation(ex)) {
                log.warn("TypeConge update conflict: id={}, entrepriseId={}, libelle={}, cause={}",
                        id, entrepriseId, dto.getLibelle(), mostSpecificMessage(ex));
                throw conflict(dto.getLibelle(), ex);
            }
            log.error("TypeConge update persistence failed: id={}, entrepriseId={}, libelle={}, cause={}",
                    id, entrepriseId, dto.getLibelle(), mostSpecificMessage(ex), ex);
            throw ex;
        }
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
        if (entrepriseId == null || entrepriseId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune entreprise associee a ce compte RH.");
        }
        return entrepriseId;
    }

    private void normalizeAndValidate(TypeCongeDTO dto) {
        if (dto == null) {
            throw badRequest("Le type de conge est obligatoire.");
        }

        String libelle = normalizeDisplayLabel(dto.getLibelle());
        if (libelle.isBlank()) {
            throw badRequest("Le libelle du type de conge est obligatoire.");
        }
        if (libelle.length() > MAX_LIBELLE_LENGTH) {
            throw badRequest("Le libelle ne peut pas depasser " + MAX_LIBELLE_LENGTH + " caracteres.");
        }
        if (dto.getNombreJoursMax() != null && dto.getNombreJoursMax() < 0) {
            throw badRequest("Le nombre maximum de jours doit etre positif ou nul.");
        }

        dto.setLibelle(libelle);
    }

    private void rejectDuplicateLibelle(String libelle, Long entrepriseId, Long ignoredId) {
        String comparisonKey = normalizeComparisonKey(libelle);
        boolean duplicate = typeCongeRepository.findAllByEntrepriseId(entrepriseId).stream()
                .filter(existing -> ignoredId == null || !Objects.equals(existing.getId(), ignoredId))
                .map(TypeConge::getLibelle)
                .filter(Objects::nonNull)
                .map(this::normalizeComparisonKey)
                .anyMatch(comparisonKey::equals);

        if (duplicate) {
            log.warn("Duplicate TypeConge rejected: entrepriseId={}, libelle={}", entrepriseId, libelle);
            throw conflict(libelle, null);
        }
    }

    private String normalizeDisplayLabel(String value) {
        return value == null ? "" : WHITESPACE.matcher(value.trim()).replaceAll(" ");
    }

    private String normalizeComparisonKey(String value) {
        String decomposed = Normalizer.normalize(normalizeDisplayLabel(value), Normalizer.Form.NFD);
        return DIACRITICS.matcher(decomposed)
                .replaceAll("")
                .toLowerCase(Locale.ROOT);
    }

    private ResponseStatusException badRequest(String message) {
        log.warn("Invalid TypeConge request: {}", message);
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private ResponseStatusException conflict(String libelle, Throwable cause) {
        String message = "Un type de conge avec le libelle '" + libelle + "' existe deja.";
        return cause == null
                ? new ResponseStatusException(HttpStatus.CONFLICT, message)
                : new ResponseStatusException(HttpStatus.CONFLICT, message, cause);
    }

    private String mostSpecificMessage(DataIntegrityViolationException ex) {
        Throwable cause = ex.getMostSpecificCause();
        return cause == null ? ex.getMessage() : cause.getMessage();
    }

    private boolean isUniqueViolation(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof SQLException sqlException && "23505".equals(sqlException.getSQLState())) {
                return true;
            }
            String message = current.getMessage();
            if (message != null) {
                String normalized = message.toLowerCase(Locale.ROOT);
                if (normalized.contains("duplicate key") || normalized.contains("unique constraint")) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }

    private boolean canAccess(TypeConge entity, Long entrepriseId) {
        return entity != null && (Objects.equals(entity.getEntrepriseId(), entrepriseId) || entity.getEntrepriseId() == null);
    }
}
