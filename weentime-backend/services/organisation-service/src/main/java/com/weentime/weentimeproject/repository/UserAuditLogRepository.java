package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.UserAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserAuditLogRepository extends JpaRepository<UserAuditLog, Long> {
    List<UserAuditLog> findByPerformedByOrderByCreatedAtDesc(String performedBy);
}
