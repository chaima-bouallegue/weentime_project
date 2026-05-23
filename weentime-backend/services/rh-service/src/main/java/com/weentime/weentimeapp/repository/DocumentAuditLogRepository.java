package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.DocumentAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DocumentAuditLogRepository extends JpaRepository<DocumentAuditLog, Long> {

    List<DocumentAuditLog> findByDocumentIdOrderByPerformedAtDesc(Long documentId);

    List<DocumentAuditLog> findByDocumentIdOrderByPerformedAtAsc(Long documentId);

    List<DocumentAuditLog> findByEntrepriseIdOrderByPerformedAtDesc(Long entrepriseId);
}
