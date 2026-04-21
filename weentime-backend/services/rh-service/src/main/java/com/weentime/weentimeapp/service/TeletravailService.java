package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.StatsManagerDTO;
import com.weentime.weentimeapp.dto.StatsRhDTO;
import com.weentime.weentimeapp.dto.TeletravailCreateDTO;
import com.weentime.weentimeapp.dto.TeletravailResponseDTO;

import java.util.List;

public interface TeletravailService {
    TeletravailResponseDTO create(TeletravailCreateDTO dto, String userEmail);
    TeletravailResponseDTO getById(Long id);
    List<TeletravailResponseDTO> getMesDemandes(String userEmail);
    TeletravailResponseDTO annuler(Long id, String userEmail);
    
    // Manager
    List<TeletravailResponseDTO> getDemandesEquipe(String userEmail);
    List<TeletravailResponseDTO> getMesDecisions(String userEmail);
    StatsManagerDTO getStatsManager(String userEmail);
    TeletravailResponseDTO validerManager(Long id, Long managerId, String commentaire);
    TeletravailResponseDTO rejeterManager(Long id, Long managerId, String commentaire);
    
    // RH
    List<TeletravailResponseDTO> getEnAttenteRh();
    List<TeletravailResponseDTO> getHistoriqueGlobal();
    StatsRhDTO getStatsRh();
    TeletravailResponseDTO validerRH(Long id, String commentaire);
    TeletravailResponseDTO rejeterRH(Long id, String commentaire);
}
