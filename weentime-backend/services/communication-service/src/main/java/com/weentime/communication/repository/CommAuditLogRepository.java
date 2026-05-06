package com.weentime.communication.repository;

import com.weentime.communication.entity.CommAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CommAuditLogRepository extends JpaRepository<CommAuditLog, UUID> {
}
