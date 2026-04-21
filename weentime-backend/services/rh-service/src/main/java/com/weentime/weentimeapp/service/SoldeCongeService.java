package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.SoldeCongeDTO;
import java.util.List;

public interface SoldeCongeService {
    SoldeCongeDTO getByUtilisateurAndType(Long utilisateurId, Long typeCongeId);
    List<SoldeCongeDTO> getByUtilisateur(Long utilisateurId);
    SoldeCongeDTO updateSolde(Long utilisateurId, Long typeCongeId, Double nouveauSolde);
    Double getTotalJoursRestants(Long utilisateurId);
    void initialiserSoldes(java.util.List<Long> utilisateurIds, boolean overwrite);
}
