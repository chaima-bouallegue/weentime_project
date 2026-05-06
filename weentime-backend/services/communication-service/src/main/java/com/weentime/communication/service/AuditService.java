package com.weentime.communication.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.entity.CommAuditLog;
import com.weentime.communication.repository.CommAuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class AuditService {

    private final CommAuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    public void record(Long entrepriseId, Long actorId, String entityType, String entityId, String action, Object payload) {
        CommAuditLog log = new CommAuditLog();
        log.setEntrepriseId(entrepriseId);
        log.setActorId(actorId);
        log.setEntityType(entityType);
        log.setEntityId(entityId);
        log.setAction(action);
        log.setPayload(write(payload));
        log.setCreatedAt(Instant.now());
        auditLogRepository.save(log);
    }

    private String write(Object payload) {
        try {
            return payload == null ? "{}" : objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            return "{}";
        }
    }
}
