package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.request.EntrepriseRequest;
import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface EntrepriseService {
    EntrepriseResponse createEntreprise(EntrepriseRequest request);
    EntrepriseResponse getEntrepriseById(Long id);
    Page<EntrepriseResponse> getAllEntreprises(Pageable pageable);
    EntrepriseResponse updateEntreprise(Long id, EntrepriseRequest request);
    void deleteEntreprise(Long id);
    com.weentime.weentimeproject.dto.EntrepriseValidationDTO validateCode(String code);
    EntrepriseResponse regenerateInvitationCode(Long id);
    EntrepriseResponse getByCode(String codeInvitation);
}
