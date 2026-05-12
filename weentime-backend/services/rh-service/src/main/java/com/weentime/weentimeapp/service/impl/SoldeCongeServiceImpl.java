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
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class SoldeCongeServiceImpl implements SoldeCongeService {

    private final SoldeCongeRepository soldeCongeRepository;
    private final TypeCongeRepository typeCongeRepository;
    private final SoldeCongeMapper soldeCongeMapper;

    @Override
    @Transactional(readOnly = true)
    public SoldeCongeDTO getByUtilisateurAndType(Long utilisateurId, Long typeCongeId) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        return soldeCongeRepository.findByUtilisateurIdAndTypeCongeId(utilisateurId, typeCongeId)
                .filter(s -> s.getEntrepriseId().equals(entrepriseId))
                .map(soldeCongeMapper::toDto)
                .orElseGet(() -> defaultSolde(utilisateurId, typeCongeId, java.time.LocalDate.now().getYear()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SoldeCongeDTO> getByUtilisateur(Long utilisateurId) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        return soldeCongeMapper.toDtoList(soldeCongeRepository.findByUtilisateurId(utilisateurId).stream()
                .filter(s -> s.getEntrepriseId().equals(entrepriseId))
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
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        SoldeConge solde = soldeCongeRepository.findByUtilisateurIdAndTypeCongeId(utilisateurId, typeCongeId)
                .filter(s -> s.getEntrepriseId().equals(entrepriseId))
                .orElseThrow(() -> new EntityNotFoundException("Solde not found for the given user and type"));
        solde.setJoursRestants(nouveauSolde);
        return soldeCongeMapper.toDto(soldeCongeRepository.save(solde));
    }

    @Override
    @Transactional(readOnly = true)
    public Double getTotalJoursRestants(Long utilisateurId) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
        return soldeCongeRepository.findByUtilisateurId(utilisateurId).stream()
                .filter(s -> s.getEntrepriseId().equals(entrepriseId))
                .mapToDouble(s -> s.getJoursRestants() != null ? s.getJoursRestants() : 0.0)
                .sum();
    }

    @Override
    @Transactional
    public void initialiserSoldes(List<Long> utilisateurIds, boolean overwrite) {
        Long entrepriseId = SecurityUtils.getCurrentEntrepriseId();
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
}
