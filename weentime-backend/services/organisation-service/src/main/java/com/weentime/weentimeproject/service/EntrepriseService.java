package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.EntrepriseStatsDto;
import com.weentime.weentimeproject.dto.EntrepriseValidationDTO;
import com.weentime.weentimeproject.dto.request.EntrepriseRequest;
import com.weentime.weentimeproject.dto.response.EntrepriseResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface EntrepriseService {

    // ── CRUD
    EntrepriseResponse createEntreprise(EntrepriseRequest request);

    EntrepriseResponse getEntrepriseById(Long id);

    EntrepriseResponse updateEntreprise(Long id, EntrepriseRequest request);

    void deleteEntreprise(Long id);

    // ── Liste filtrée (server-side)
    Page<EntrepriseResponse> getAllEntreprises(String status, String search, Pageable pageable);

    Page<EntrepriseResponse> getAllEntreprises(Pageable pageable);

    // ── Stats agrégées
    EntrepriseStatsDto getStats();

    // ── Changement de statut
    EntrepriseResponse changeStatus(Long id, String status);

    // ── Batch
    void deleteBatch(List<Long> ids);

    void changeStatusBatch(List<Long> ids, String status);

    // ── Code invitation
    EntrepriseValidationDTO validateCode(String code);

    EntrepriseResponse regenerateInvitationCode(Long id);

    EntrepriseResponse getByCode(String codeInvitation);
}