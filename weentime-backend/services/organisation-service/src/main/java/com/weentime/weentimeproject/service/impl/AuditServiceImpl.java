package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.entity.UserAuditLog;
import com.weentime.weentimeproject.repository.UserAuditLogRepository;
import com.weentime.weentimeproject.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditServiceImpl implements AuditService {

    private final UserAuditLogRepository auditLogRepository;

    @Async
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logAudit(String action, String targetUser, String details, String performedBy) {
        try {
            UserAuditLog logEntry = UserAuditLog.builder()
                    .action(action)
                    .performedBy(performedBy)
                    .targetUser(targetUser)
                    .details(details)
                    .build();
            
            auditLogRepository.save(logEntry);
            log.debug("Async Audit Log saved: {} for target {}", action, targetUser);
        } catch (Exception e) {
            log.error("Failed to save audit log asynchronously: {}", e.getMessage(), e);
        }
    }
}
