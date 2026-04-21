package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.DemandeDTO;
import java.util.List;

public interface DemandeService {
    DemandeDTO getById(Long id);
    List<DemandeDTO> getAllByUtilisateur(Long utilisateurId);
    List<DemandeDTO> getByManager(Long managerId);
    List<DemandeDTO> getAll();
    List<DemandeDTO> getAllForEntreprise(Long entrepriseId);
}
