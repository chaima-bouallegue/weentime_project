package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.CongeDTO;
import java.util.List;

public interface CongeService {
    CongeDTO create(CongeDTO dto);
    CongeDTO getById(Long id);
    CongeDTO validateByManager(Long id, Long managerId);
    CongeDTO validateByRH(Long id, Long rhId);
    CongeDTO reject(Long id, Long validatorId, String commentaire);
    CongeDTO cancel(Long id);
    List<CongeDTO> getByUtilisateur(Long utilisateurId);
    List<CongeDTO> getByUtilisateurs(List<Long> utilisateurIds);
    List<CongeDTO> getAll();
    List<CongeDTO> getPendingForEntreprise(Long entrepriseId);
}
