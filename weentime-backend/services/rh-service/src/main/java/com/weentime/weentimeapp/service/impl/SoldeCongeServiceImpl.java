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
        return soldeCongeRepository.findByUtilisateurIdAndTypeCongeId(utilisateurId, typeCongeId)
                .map(soldeCongeMapper::toDto)
                .orElseGet(() -> defaultSolde(utilisateurId, typeCongeId, java.time.LocalDate.now().getYear()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SoldeCongeDTO> getByUtilisateur(Long utilisateurId) {
        return soldeCongeMapper.toDtoList(soldeCongeRepository.findByUtilisateurId(utilisateurId));
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
        SoldeConge solde = soldeCongeRepository.findByUtilisateurIdAndTypeCongeId(utilisateurId, typeCongeId)
                .orElseThrow(() -> new EntityNotFoundException("Solde not found for the given user and type"));
        solde.setJoursRestants(nouveauSolde);
        return soldeCongeMapper.toDto(soldeCongeRepository.save(solde));
    }

    @Override
    @Transactional(readOnly = true)
    public Double getTotalJoursRestants(Long utilisateurId) {
        return soldeCongeRepository.findByUtilisateurId(utilisateurId).stream()
                .mapToDouble(s -> s.getJoursRestants() != null ? s.getJoursRestants() : 0.0)
                .sum();
    }

    @Override
    @Transactional
    public void initialiserSoldes(List<Long> utilisateurIds, boolean overwrite) {
        List<TypeConge> types = typeCongeRepository.findAll();
        int currentYear = java.time.LocalDate.now().getYear();

        for (Long uid : utilisateurIds) {
            for (TypeConge type : types) {
                java.util.Optional<SoldeConge> existingSolde = soldeCongeRepository.findByUtilisateurIdAndTypeCongeId(uid, type.getId());

                if (existingSolde.isPresent() && !overwrite) {
                    // Safe Mode: skip existing records
                    continue;
                }

                SoldeConge solde = existingSolde.orElse(SoldeConge.builder()
                        .utilisateurId(uid)
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
