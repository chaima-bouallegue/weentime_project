package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.EntrepriseAccessControlDto;
import com.weentime.weentimeproject.dto.EntrepriseAccessControlHistoryDto;

import java.util.List;

public interface EntrepriseAccessControlService {

    EntrepriseAccessControlDto getAccessControl(Long entrepriseId);

    EntrepriseAccessControlDto updateAccessControl(
            Long entrepriseId,
            EntrepriseAccessControlDto request,
            String updatedBy);

    List<EntrepriseAccessControlHistoryDto> getHistory(Long entrepriseId);

    /**
     * Vérifie si un module est activé pour un rôle dans une entreprise.
     * Retourne true par défaut si aucune configuration n'existe (fail-open).
     */
    boolean isModuleEnabled(Long entrepriseId, String role, String moduleKey);
}