package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.*;
import org.springframework.data.domain.Pageable;
import java.util.List;

public interface RhSoldeService {
    PageResponse<EmployeeSoldeResponse> getGlobalSoldes(Integer annee, String query, Pageable pageable);

    void initialiserSoldes(InitialisationRequest request);

    void reinitialiserAnnuel(ReinitialisationAnnuelleRequest request);

    void ajusterSolde(Long utilisateurId, Long typeCongeId, SoldeAjustementRequest request);

    List<SoldeAuditLogDTO> getAuditLogsByUtilisateur(Long utilisateurId);

    List<SoldeDetailDTO> getByUtilisateur(Long utilisateurId);
}
