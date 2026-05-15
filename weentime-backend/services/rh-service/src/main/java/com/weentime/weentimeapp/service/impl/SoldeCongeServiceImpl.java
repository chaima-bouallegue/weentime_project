package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.SoldeCongeDTO;
import com.weentime.weentimeapp.entity.SoldeConge;
import com.weentime.weentimeapp.entity.TypeConge;
import com.weentime.weentimeapp.mapper.SoldeCongeMapper;
import com.weentime.weentimeapp.repository.SoldeCongeRepository;
import com.weentime.weentimeapp.repository.TypeCongeRepository;
import com.weentime.weentimeapp.service.SoldeCongeService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.weentime.weentimeapp.security.SecurityUtils;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Transactional
public class SoldeCongeServiceImpl implements SoldeCongeService {

    private final SoldeCongeRepository soldeCongeRepository;
    private final TypeCongeRepository typeCongeRepository;
    private final SoldeCongeMapper soldeCongeMapper;

    @Override
    @Transactional(readOnly = true)
    public SoldeCongeDTO getByUtilisateurAndType(Long utilisateurId, Long typeCongeId, Integer annee) {
        int targetYear = resolveTargetYear(annee);
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            return defaultSolde(utilisateurId, typeCongeId, targetYear);
        }
        return soldeCongeRepository.findByUtilisateurIdAndTypeCongeIdAndAnnee(utilisateurId, typeCongeId, targetYear)
                .filter(s -> canAccessSolde(s, entrepriseId))
                .map(soldeCongeMapper::toDto)
                .orElseGet(() -> defaultSolde(utilisateurId, typeCongeId, targetYear));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SoldeCongeDTO> getByUtilisateur(Long utilisateurId, Integer annee) {
        int targetYear = resolveTargetYear(annee);
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            return List.of();
        }
        return soldeCongeMapper.toDtoList(soldeCongeRepository.findByUtilisateurIdInAndAnnee(List.of(utilisateurId), targetYear).stream()
                .filter(s -> canAccessSolde(s, entrepriseId))
                .toList());
    }

    private SoldeCongeDTO defaultSolde(Long utilisateurId, Long typeCongeId, Integer annee) {
        return SoldeCongeDTO.builder()
                .utilisateurId(utilisateurId)
                .typeCongeId(typeCongeId)
                .annee(annee)
                .joursAcquis(0.0)
                .joursUtilises(0.0)
                .joursRestants(0.0)
                .joursEnAttente(0.0)
                .build();
    }

    @Override
    public SoldeCongeDTO updateSolde(Long utilisateurId, Long typeCongeId, Double nouveauSolde) {
        Long entrepriseId = requireEntrepriseId();
        SoldeConge solde = soldeCongeRepository.findByUtilisateurIdAndTypeCongeId(utilisateurId, typeCongeId)
                .filter(s -> Objects.equals(s.getEntrepriseId(), entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("Solde not found for the given user and type"));
        solde.setJoursRestants(nouveauSolde);
        return soldeCongeMapper.toDto(soldeCongeRepository.save(solde));
    }

    @Override
    @Transactional(readOnly = true)
    public Double getTotalJoursRestants(Long utilisateurId) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            return 0.0;
        }
        return soldeCongeRepository.findByUtilisateurId(utilisateurId).stream()
                .filter(s -> canAccessSolde(s, entrepriseId))
                .mapToDouble(s -> s.getJoursRestants() != null ? s.getJoursRestants() : 0.0)
                .sum();
    }

    @Override
    @Transactional
    public void initialiserSoldes(List<Long> utilisateurIds, boolean overwrite) {
        Long entrepriseId = requireEntrepriseId();
        List<TypeConge> types = typeCongeRepository.findAllByEntrepriseId(entrepriseId);
        int currentYear = java.time.LocalDate.now().getYear();

        for (Long uid : utilisateurIds) {
            for (TypeConge type : types) {
                java.util.Optional<SoldeConge> existingSolde = soldeCongeRepository.findByUtilisateurIdAndTypeCongeId(uid, type.getId());

                if (existingSolde.isPresent() && !overwrite) {
                    continue;
                }

                SoldeConge solde = existingSolde.orElse(SoldeConge.builder()
                        .utilisateurId(uid)
                        .entrepriseId(entrepriseId)
                        .typeCongeId(type.getId())
                        .annee(currentYear)
                        .build());

                double maxDays = type.getNombreJoursMax() != null ? type.getNombreJoursMax().doubleValue() : 0.0;
                
                solde.setJoursAcquis(maxDays);
                solde.setJoursRestants(maxDays);
                solde.setJoursUtilises(0.0);
                solde.setJoursEnAttente(0.0);
                solde.setAnnee(currentYear);
                
                soldeCongeRepository.save(solde);
            }
        }
    }

    private Long requireEntrepriseId() {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        if (entrepriseId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune entreprise associee a ce compte RH.");
        }
        return entrepriseId;
    }

    private int resolveTargetYear(Integer annee) {
        return annee != null ? annee : java.time.LocalDate.now().getYear();
    }

    private boolean canAccessSolde(SoldeConge soldeConge, Long entrepriseId) {
        return soldeConge != null
                && (Objects.equals(soldeConge.getEntrepriseId(), entrepriseId) || soldeConge.getEntrepriseId() == null);
    }
}
