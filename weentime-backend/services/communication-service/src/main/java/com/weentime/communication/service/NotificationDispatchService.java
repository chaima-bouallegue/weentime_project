package com.weentime.communication.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.dto.InternalNotificationDispatchRequest;
import com.weentime.communication.dto.MessageResponse;
import com.weentime.communication.dto.NotificationCategory;
import com.weentime.communication.dto.NotificationEventTypes;
import com.weentime.communication.dto.NotificationIntentPayload;
import com.weentime.communication.dto.RealtimeNotificationPayload;
import com.weentime.communication.entity.ChannelType;
import com.weentime.communication.entity.CommChannel;
import com.weentime.communication.entity.CommChannelMember;
import com.weentime.communication.entity.CommEventOutbox;
import com.weentime.communication.entity.CommNotificationEvent;
import com.weentime.communication.entity.NotificationEventStatus;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.repository.CommNotificationEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationDispatchService {

    private static final String COMMUNICATION_TYPE = "COMMUNICATION";

    private final CommNotificationEventRepository notificationEventRepository;
    private final OutboxService outboxService;
    private final OrganisationInternalService organisationInternalService;
    private final NotificationPreferencesService notificationPreferencesService;
    private final RealtimeEventService realtimeEventService;
    private final ObjectMapper objectMapper;

    @Transactional
    public Set<Long> queueMessageNotifications(
            CommChannel channel,
            List<CommChannelMember> activeMembers,
            MessageResponse message,
            List<Long> mentions
    ) {
        Set<Long> touchedRecipients = new LinkedHashSet<>();
        Map<Long, String> dominantEventByRecipient = new LinkedHashMap<>();
        Set<Long> mentionTargets = mentions == null ? Set.of() : new LinkedHashSet<>(mentions);

        for (CommChannelMember member : activeMembers) {
            Long recipientId = member.getId().getUserId();
            Long senderId = message.sender() == null ? null : message.sender().id();
            if (Objects.equals(recipientId, senderId)) {
                continue;
            }

            var preferences = notificationPreferencesService.resolve(channel.getEntrepriseId(), recipientId);
            String memberLevel = notificationPreferencesService.normalizedLevelForMember(member, preferences);

            if (mentionTargets.contains(recipientId)) {
                if (NotificationPreferencesService.LEVEL_MUTED.equals(memberLevel) || !notificationPreferencesService.allowsMention(preferences)) {
                    continue;
                }
                queueNotification(
                        channel,
                        message,
                        recipientId,
                        NotificationEventTypes.COMMUNICATION_MENTION_CREATED,
                        "mention:" + message.id(),
                        senderName(message) + " vous a mentionne dans " + channel.getName(),
                        NotificationCategory.ACTION_REQUIRED
                );
                dominantEventByRecipient.put(recipientId, NotificationEventTypes.COMMUNICATION_MENTION_CREATED);
                touchedRecipients.add(recipientId);
                continue;
            }

            if (channel.getType() == ChannelType.DIRECT || channel.getType() == ChannelType.GROUP_DM) {
                if (NotificationPreferencesService.LEVEL_MUTED.equals(memberLevel)
                        || !notificationPreferencesService.allowsDirectMessage(preferences)) {
                    continue;
                }
                queueNotification(
                        channel,
                        message,
                        recipientId,
                        NotificationEventTypes.COMMUNICATION_MESSAGE_CREATED,
                        "direct:" + senderId,
                        senderName(message) + " vous a envoye un message direct",
                        NotificationCategory.INFO
                );
                touchedRecipients.add(recipientId);
                continue;
            }

            if (!notificationPreferencesService.allowsChannelMessage(member, preferences)) {
                continue;
            }

            if (dominantEventByRecipient.containsKey(recipientId)) {
                continue;
            }

            queueNotification(
                    channel,
                    message,
                    recipientId,
                    NotificationEventTypes.COMMUNICATION_MESSAGE_CREATED,
                    "channel:" + channel.getId(),
                    "Nouveau message dans " + channel.getName(),
                    NotificationCategory.INFO
            );
            touchedRecipients.add(recipientId);
        }

        return touchedRecipients;
    }

    @Transactional
    public void dispatchNotification(CommEventOutbox outboxEntry) {
        String notificationEventId = parseNotificationEventId(outboxEntry.getPayload());
        CommNotificationEvent event = notificationEventRepository.findByNotificationEventId(notificationEventId)
                .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "COMM_NOTIFICATION_EVENT_NOT_FOUND",
                        "The notification event could not be found.", Map.of("notificationEventId", notificationEventId)));

        if (event.getStatus() == NotificationEventStatus.SENT) {
            return;
        }

        NotificationIntentPayload payload = readPayload(event.getPayload(), NotificationIntentPayload.class);
        organisationInternalService.sendNotification(
                event.getRecipientId(),
                new InternalNotificationDispatchRequest(
                        payload.title(),
                        payload.message(),
                        COMMUNICATION_TYPE,
                        payload.actionUrl(),
                        event.getEntrepriseId(),
                        payload.metadata()
                )
        );

        event.setStatus(NotificationEventStatus.SENT);
        event.setSentAt(Instant.now());
        event.setUpdatedAt(Instant.now());
        event.setLastError(null);
        notificationEventRepository.save(event);
    }

    @Transactional
    public void markFailed(String notificationEventId, String error, boolean deadLetter) {
        notificationEventRepository.findByNotificationEventId(notificationEventId).ifPresent(event -> {
            event.setAttemptCount(event.getAttemptCount() + 1);
            event.setStatus(deadLetter ? NotificationEventStatus.DEAD_LETTER : NotificationEventStatus.FAILED);
            event.setLastError(error);
            event.setUpdatedAt(Instant.now());
            notificationEventRepository.save(event);
        });
    }

    private void queueNotification(
            CommChannel channel,
            MessageResponse message,
            Long recipientId,
            String eventType,
            String groupKey,
            String title,
            NotificationCategory category
    ) {
        String notificationEventId = buildNotificationEventId(message.entrepriseId(), recipientId, eventType, message.id());
        if (notificationEventRepository.findByNotificationEventId(notificationEventId).isPresent()) {
            return;
        }

        String preview = message.body() == null || message.body().isBlank()
                ? title
                : title + ": " + message.body();
        Map<String, Object> metadata = Map.of(
                "channelId", channel.getId(),
                "messageId", message.id(),
                "eventType", eventType,
                "groupKey", groupKey,
                "category", category.name()
        );
        NotificationIntentPayload payload = new NotificationIntentPayload(
                notificationEventId,
                recipientId,
                eventType,
                groupKey,
                channel.getId(),
                message.id(),
                title,
                preview,
                "/app/messages/channel/" + channel.getId(),
                metadata
        );

        Instant now = Instant.now();
        CommNotificationEvent event = new CommNotificationEvent();
        event.setNotificationEventId(notificationEventId);
        event.setEntrepriseId(message.entrepriseId());
        event.setRecipientId(recipientId);
        event.setEventType(eventType);
        event.setGroupKey(groupKey);
        event.setChannelId(channel.getId());
        event.setMessageId(message.id());
        event.setPayload(write(payload));
        event.setStatus(NotificationEventStatus.PENDING);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        notificationEventRepository.save(event);

        outboxService.recordPending(
                message.entrepriseId(),
                "NOTIFICATION_EVENT",
                notificationEventId,
                "notification.dispatch",
                "notification.dispatch:" + notificationEventId,
                Map.of("notificationEventId", notificationEventId)
        );

        publishRealtimeNotification(event, payload, message, category);
    }

    private void publishRealtimeNotification(
            CommNotificationEvent event,
            NotificationIntentPayload payload,
            MessageResponse message,
            NotificationCategory category
    ) {
        try {
            realtimeEventService.publishNotificationCreated(
                    event.getEntrepriseId(),
                    message.sender() == null ? null : message.sender().id(),
                    event.getRecipientId(),
                    RealtimeNotificationPayload.builder()
                            .notificationEventId(event.getNotificationEventId())
                            .recipientId(event.getRecipientId())
                            .entrepriseId(event.getEntrepriseId())
                            .eventType(event.getEventType())
                            .category(category.name())
                            .title(payload.title())
                            .message(payload.message())
                            .actionUrl(payload.actionUrl())
                            .channelId(payload.channelId())
                            .messageId(payload.messageId())
                            .metadata(payload.metadata())
                            .createdAt(event.getCreatedAt())
                            .build()
            );
        } catch (Exception exception) {
            log.warn(
                    "Unable to queue realtime notification event. eventType={}, tenant={}, recipient={}, fallback=outbox_only, error={}",
                    event.getEventType(),
                    event.getEntrepriseId(),
                    event.getRecipientId(),
                    exception.getClass().getSimpleName()
            );
        }
    }

    private String senderName(MessageResponse message) {
        if (message.sender() == null || message.sender().fullName() == null || message.sender().fullName().isBlank()) {
            return "Un utilisateur";
        }
        return message.sender().fullName();
    }

    private String buildNotificationEventId(Long entrepriseId, Long recipientId, String eventType, UUID messageId) {
        return entrepriseId + ":" + recipientId + ":" + eventType + ":" + messageId;
    }

    private String parseNotificationEventId(String payload) {
        try {
            Object value = objectMapper.readValue(payload, Map.class).get("notificationEventId");
            if (value == null) {
                throw new IllegalArgumentException("notificationEventId missing");
            }
            return String.valueOf(value);
        } catch (Exception exception) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_NOTIFICATION_PAYLOAD_INVALID",
                    "The notification outbox payload is invalid.", Map.of());
        }
    }

    private String write(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new CommunicationException(HttpStatus.INTERNAL_SERVER_ERROR, "COMM_NOTIFICATION_SERIALIZATION_FAILED",
                    "Unable to serialize the notification event.", Map.of());
        }
    }

    private <T> T readPayload(String payload, Class<T> targetType) {
        try {
            return objectMapper.readValue(payload, targetType);
        } catch (JsonProcessingException exception) {
            throw new CommunicationException(HttpStatus.INTERNAL_SERVER_ERROR, "COMM_NOTIFICATION_PAYLOAD_INVALID",
                    "Unable to parse the notification event payload.", Map.of());
        }
    }
}
