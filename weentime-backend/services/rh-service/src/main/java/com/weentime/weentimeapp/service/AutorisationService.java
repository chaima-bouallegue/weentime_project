package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.AutorisationDTO;
import com.weentime.weentimeapp.dto.PageResponse;
import com.weentime.weentimeapp.dto.StatsAutorisationDTO;
import java.util.List;

public interface AutorisationService {
    AutorisationDTO create(AutorisationDTO dto, String userEmail);
    AutorisationDTO getById(Long id);
    
    // Actions
    AutorisationDTO validateManager(Long id, String managerEmail);
    AutorisationDTO validateRH(Long id, String rhEmail);
    AutorisationDTO reject(Long id, String validatorEmail, String commentaire);
    AutorisationDTO cancel(Long id, String userEmail);
    
    // History & KPIs
    PageResponse<AutorisationDTO> getEmployeeHistory(String email, int page, int size);
    PageResponse<AutorisationDTO> getManagerHistory(String email, int page, int size);
    PageResponse<AutorisationDTO> getRhHistory(String email, int page, int size);

    StatsAutorisationDTO getEmployeeKPIs(String email);
    StatsAutorisationDTO getManagerKPIs(String email);
    StatsAutorisationDTO getRhKPIs(String email);

    List<AutorisationDTO> getAll();
}
