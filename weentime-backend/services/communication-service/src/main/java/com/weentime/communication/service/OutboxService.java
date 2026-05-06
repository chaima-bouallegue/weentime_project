package com.weentime.communication.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.config.CommunicationProperties;
import com.weentime.communication.entity.CommEventOutbox;
import com.weentime.communication.entity.OutboxStatus;
import com.weentime.communication.repository.CommEventOutboxRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class OutboxService {

    private final CommEventOutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;
    private final CommunicationProperties communicationProperties;

    @Transactional
    public CommEventOutbox recordPending(
            Long entrepriseId,
            String aggregateType,
            String aggregateId,
            String eventType,
            String idempotencyKey,
            Object payload
    ) {
        if (idempotencyKey != null && outboxRepository.existsByIdempotencyKey(idempotencyKey)) {
            return outboxRepository.findByIdempotencyKey(idempotencyKey).orElseThrow();
        }

        Instant now = Instant.now();
        CommEventOutbox event = new CommEventOutbox();
        event.setEntrepriseId(entrepriseId);
        event.setAggregateType(aggregateType);
        event.setAggregateId(aggregateId);
        event.setEventType(eventType);
        event.setIdempotencyKey(idempotencyKey);
        event.setPayload(write(payload));
        event.setStatus(OutboxStatus.PENDING);
        event.setRetryCount(0);
        event.setMaxAttempts(communicationProperties.getOutbox().getMaxAttempts());
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        return outboxRepository.save(event);
    }

    @Transactional
    public void markSent(CommEventOutbox event) {
        event.setStatus(OutboxStatus.SENT);
        event.setSentAt(Instant.now());
        event.setUpdatedAt(Instant.now());
        event.setFailureReason(null);
        outboxRepository.save(event);
    }

    @Transactional
    public void markFailure(CommEventOutbox event, Exception exception) {
        int nextRetryCount = event.getRetryCount() + 1;
        event.setRetryCount(nextRetryCount);
        event.setFailureReason(exception.getMessage());
        event.setUpdatedAt(Instant.now());

        if (nextRetryCount >= event.getMaxAttempts()) {
            event.setStatus(OutboxStatus.DEAD_LETTER);
            event.setNextAttemptAt(null);
        } else {
            long backoff = communicationProperties.getOutbox().getRetryBackoffMs() * nextRetryCount;
            event.setStatus(OutboxStatus.FAILED);
            event.setNextAttemptAt(Instant.now().plusMillis(backoff));
        }

        outboxRepository.save(event);
    }

    @Transactional(readOnly = true)
    public Map<String, Long> pendingByEventType() {
        return outboxRepository.countByStatusGroupedByEventType(OutboxStatus.PENDING).stream()
                .collect(Collectors.toMap(
                        row -> String.valueOf(row[0]),
                        row -> (Long) row[1]
                ));
    }

    @Transactional(readOnly = true)
    public CommEventOutbox getRequired(UUID outboxId) {
        return outboxRepository.findById(outboxId).orElseThrow();
    }

    private String write(Object payload) {
        try {
            return payload == null ? "{}" : objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            return "{}";
        }
    }
}
