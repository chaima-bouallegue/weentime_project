package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.SoldeAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SoldeAuditLogRepository extends JpaRepository<SoldeAuditLog, Long> {
    List<SoldeAuditLog> findByUtilisateurIdAndAnnee(Long utilisateurId, Integer annee);
    List<SoldeAuditLog> findByUtilisateurIdOrderByTimestampDesc(Long utilisateurId);
}
