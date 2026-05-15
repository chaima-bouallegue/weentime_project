package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.SoldeCongeDTO;
import java.util.List;

public interface SoldeCongeService {
    default SoldeCongeDTO getByUtilisateurAndType(Long utilisateurId, Long typeCongeId) {
        return getByUtilisateurAndType(utilisateurId, typeCongeId, null);
    }

    SoldeCongeDTO getByUtilisateurAndType(Long utilisateurId, Long typeCongeId, Integer annee);

    default List<SoldeCongeDTO> getByUtilisateur(Long utilisateurId) {
        return getByUtilisateur(utilisateurId, null);
    }

    List<SoldeCongeDTO> getByUtilisateur(Long utilisateurId, Integer annee);
    SoldeCongeDTO updateSolde(Long utilisateurId, Long typeCongeId, Double nouveauSolde);
    Double getTotalJoursRestants(Long utilisateurId);
    void initialiserSoldes(java.util.List<Long> utilisateurIds, boolean overwrite);
}
