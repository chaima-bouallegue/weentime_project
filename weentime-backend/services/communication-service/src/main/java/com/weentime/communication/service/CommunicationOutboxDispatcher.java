package com.weentime.communication.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.dto.AdminOutboxStatusResponse;
import com.weentime.communication.entity.CommEventOutbox;
import com.weentime.communication.entity.OutboxStatus;
import com.weentime.communication.repository.CommEventOutboxRepository;
import com.weentime.communication.repository.CommNotificationEventRepository;
import com.weentime.communication.entity.NotificationEventStatus;
import com.weentime.communication.config.CommunicationProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CommunicationOutboxDispatcher {

    private final CommEventOutboxRepository outboxRepository;
    private final CommNotificationEventRepository notificationEventRepository;
    private final NotificationDispatchService notificationDispatchService;
    private final RealtimeEventService realtimeEventService;
    private final OutboxService outboxService;
    private final ObjectMapper objectMapper;
    private final CommunicationProperties communicationProperties;

    @Scheduled(fixedDelayString = "${communication.outbox.dispatch-delay-ms:5000}")
    public void dispatchPendingRows() {
        List<CommEventOutbox> batch = outboxRepository.findDispatchBatch(
                List.of(OutboxStatus.PENDING, OutboxStatus.FAILED),
                Instant.now(),
                PageRequest.of(0, communicationProperties.getOutbox().getBatchSize())
        );
        for (CommEventOutbox event : batch) {
            process(event.getId());
        }
    }

    @Transactional
    public void process(java.util.UUID outboxId) {
        CommEventOutbox event = outboxService.getRequired(outboxId);
        try {
            if ("notification.dispatch".equals(event.getEventType())) {
                notificationDispatchService.dispatchNotification(event);
            } else if ("websocket.fanout".equals(event.getEventType())) {
                realtimeEventService.dispatchStoredEvent(readEventId(event));
            }
            outboxService.markSent(event);
        } catch (Exception exception) {
            boolean deadLetter = event.getRetryCount() + 1 >= event.getMaxAttempts();
            if ("notification.dispatch".equals(event.getEventType())) {
                notificationDispatchService.markFailed(readNotificationEventId(event), exception.getMessage(), deadLetter);
            }
            outboxService.markFailure(event, exception);
            log.warn("Outbox dispatch failed for {} {}: {}", event.getEventType(), event.getId(), exception.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public AdminOutboxStatusResponse getStatus() {
        return AdminOutboxStatusResponse.builder()
                .pending(outboxRepository.countByStatus(OutboxStatus.PENDING))
                .sent(outboxRepository.countByStatus(OutboxStatus.SENT))
                .failed(outboxRepository.countByStatus(OutboxStatus.FAILED))
                .deadLetter(outboxRepository.countByStatus(OutboxStatus.DEAD_LETTER))
                .notificationPending(notificationEventRepository.countByStatus(NotificationEventStatus.PENDING))
                .notificationDeadLetter(notificationEventRepository.countByStatus(NotificationEventStatus.DEAD_LETTER))
                .pendingByEventType(outboxService.pendingByEventType())
                .build();
    }

    private String readNotificationEventId(CommEventOutbox event) {
        try {
            Map<?, ?> payload = objectMapper.readValue(event.getPayload(), Map.class);
            Object value = payload.get("notificationEventId");
            return value == null ? "" : String.valueOf(value);
        } catch (Exception exception) {
            return "";
        }
    }

    private java.util.UUID readEventId(CommEventOutbox event) {
        try {
            Map<?, ?> payload = objectMapper.readValue(event.getPayload(), Map.class);
            Object value = payload.get("eventId");
            return value == null ? java.util.UUID.fromString(event.getAggregateId()) : java.util.UUID.fromString(String.valueOf(value));
        } catch (Exception exception) {
            return java.util.UUID.fromString(event.getAggregateId());
        }
    }
}
