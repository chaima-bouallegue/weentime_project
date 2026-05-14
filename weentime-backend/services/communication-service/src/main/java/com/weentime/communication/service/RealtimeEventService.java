package com.weentime.communication.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.config.CommunicationProperties;
import com.weentime.communication.dto.EventReplayResponse;
import com.weentime.communication.dto.MessageResponse;
import com.weentime.communication.dto.NotificationEventTypes;
import com.weentime.communication.dto.ReadReceiptEventResponse;
import com.weentime.communication.dto.RealtimeNotificationPayload;
import com.weentime.communication.dto.TypingEventPayload;
import com.weentime.communication.dto.UnreadSummaryResponse;
import com.weentime.communication.dto.WebSocketErrorPayload;
import com.weentime.communication.dto.WebSocketEventResponse;
import com.weentime.communication.entity.CommEventStream;
import com.weentime.communication.entity.RealtimeEventScope;
import com.weentime.communication.security.CommunicationUserPrincipal;
import com.weentime.communication.repository.CommChannelMemberRepository;
import com.weentime.communication.repository.CommEventStreamRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RealtimeEventService {

    private final RealtimeEventPublisher realtimeEventPublisher;
    private final CommEventStreamRepository eventStreamRepository;
    private final CommChannelMemberRepository channelMemberRepository;
    private final OutboxService outboxService;
    private final OrderedUuidGenerator orderedUuidGenerator;
    private final ObjectMapper objectMapper;
    private final CommunicationProperties communicationProperties;

    public void publishMessageCreated(Long entrepriseId, Long actorId, UUID channelId, MessageResponse message) {
        queueChannelEvent(entrepriseId, actorId, channelId, "message.created", message);
    }

    public void publishMessageUpdated(Long entrepriseId, Long actorId, UUID channelId, MessageResponse message) {
        queueChannelEvent(entrepriseId, actorId, channelId, "message.updated", message);
    }

    public void publishMessageDeleted(Long entrepriseId, Long actorId, UUID channelId, MessageResponse message) {
        queueChannelEvent(entrepriseId, actorId, channelId, "message.deleted", message);
    }

    public void publishReactionAdded(Long entrepriseId, Long actorId, UUID channelId, UUID messageId, String emoji, MessageResponse message) {
        queueChannelEvent(entrepriseId, actorId, channelId, "reaction.added", Map.of(
                "messageId", messageId,
                "emoji", emoji,
                "message", message
        ));
    }

    public void publishReactionRemoved(Long entrepriseId, Long actorId, UUID channelId, UUID messageId, String emoji, MessageResponse message) {
        queueChannelEvent(entrepriseId, actorId, channelId, "reaction.removed", Map.of(
                "messageId", messageId,
                "emoji", emoji,
                "message", message
        ));
    }

    public void publishTyping(UUID channelId, CommunicationUserPrincipal currentUser, boolean typing) {
        realtimeEventPublisher.publishChannelEvent(channelId, directEvent(
                currentUser.entrepriseId(),
                channelId,
                currentUser.userId(),
                typing ? "typing.started" : "typing.stopped",
                TypingEventPayload.builder()
                        .channelId(channelId)
                        .userId(currentUser.userId())
                        .fullName(currentUser.username() != null && !currentUser.username().isBlank()
                                ? currentUser.username()
                                : "Utilisateur")
                        .build()
        ));
    }

    public void publishReadUpdated(Long entrepriseId, Long actorId, UUID channelId, UUID messageId, Long userId, Instant readAt) {
        queueChannelEvent(entrepriseId, actorId, channelId, "read.updated", ReadReceiptEventResponse.builder()
                .channelId(channelId)
                .messageId(messageId)
                .userId(userId)
                .readAt(readAt)
                .build());
    }

    public void publishUnreadUpdated(Long entrepriseId, Long actorId, Long userId, UnreadSummaryResponse summary) {
        queueUserEvent(entrepriseId, userId, null, actorId, "unread.updated", summary);
    }

    public void publishNotificationCreated(
            Long entrepriseId,
            Long actorId,
            Long recipientUserId,
            RealtimeNotificationPayload notification
    ) {
        queueUserEvent(
                entrepriseId,
                recipientUserId,
                notification == null ? null : notification.channelId(),
                actorId,
                NotificationEventTypes.NOTIFICATIONS_CREATED,
                notification
        );
    }

    public void publishNotificationRead(
            Long entrepriseId,
            Long actorId,
            Long recipientUserId,
            RealtimeNotificationPayload notification
    ) {
        queueUserEvent(
                entrepriseId,
                recipientUserId,
                notification == null ? null : notification.channelId(),
                actorId,
                NotificationEventTypes.NOTIFICATIONS_READ,
                notification
        );
    }

    public void publishUserError(Long userId, String code, String message, Map<String, Object> details) {
        realtimeEventPublisher.publishUserEvent(userId, directEvent(
                null,
                null,
                null,
                "error",
                WebSocketErrorPayload.builder()
                        .code(code)
                        .message(message)
                        .details(details)
                        .build()
        ));
    }

    @Transactional(readOnly = true)
    public EventReplayResponse replay(UUID afterEventId, Integer limit, CommunicationUserPrincipal currentUser) {
        if (afterEventId == null) {
            return EventReplayResponse.builder()
                    .events(List.of())
                    .reloadRequired(false)
                    .reloadReason(null)
                    .lastEventId(null)
                    .build();
        }

        CommEventStream anchor = eventStreamRepository.findByEventIdAndEntrepriseId(afterEventId, currentUser.entrepriseId())
                .orElse(null);
        if (anchor == null) {
            return EventReplayResponse.builder()
                    .events(List.of())
                    .reloadRequired(true)
                    .reloadReason("EVENT_CURSOR_EXPIRED")
                    .lastEventId(afterEventId)
                    .build();
        }

        int replayLimit = Math.min(
                Math.max(limit == null ? communicationProperties.getReplay().getMaxEvents() : limit, 1),
                communicationProperties.getReplay().getMaxEvents()
        );
        long afterOrder = anchor.getStreamOrder() == null ? 0L : anchor.getStreamOrder();

        List<CommEventStream> visibleEvents = new ArrayList<>(eventStreamRepository
                .findByEntrepriseIdAndScopeAndRecipientUserIdAndStreamOrderGreaterThanOrderByStreamOrderAsc(
                        currentUser.entrepriseId(),
                        RealtimeEventScope.USER,
                        currentUser.userId(),
                        afterOrder
                ));

        Set<UUID> channelIds = channelMemberRepository.findVisibleMemberships(currentUser.entrepriseId(), currentUser.userId()).stream()
                .map(member -> member.getChannel().getId())
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (!channelIds.isEmpty()) {
            visibleEvents.addAll(eventStreamRepository.findVisibleChannelEventsAfter(
                    currentUser.entrepriseId(),
                    channelIds,
                    afterOrder
            ));
        }

        visibleEvents.sort(Comparator.comparing(CommEventStream::getStreamOrder, Comparator.nullsLast(Long::compareTo)));
        if (visibleEvents.size() > replayLimit) {
            return EventReplayResponse.builder()
                    .events(List.of())
                    .reloadRequired(true)
                    .reloadReason("EVENT_REPLAY_LIMIT_EXCEEDED")
                    .lastEventId(afterEventId)
                    .build();
        }

        List<WebSocketEventResponse> events = visibleEvents.stream()
                .map(this::toEventResponse)
                .toList();

        return EventReplayResponse.builder()
                .events(events)
                .reloadRequired(false)
                .reloadReason(null)
                .lastEventId(events.isEmpty() ? afterEventId : events.get(events.size() - 1).eventId())
                .build();
    }

    @Transactional(readOnly = true)
    public void dispatchStoredEvent(UUID eventId) {
        eventStreamRepository.findById(eventId).ifPresent(event -> {
            WebSocketEventResponse response = toEventResponse(event);
            if (event.getScope() == RealtimeEventScope.USER) {
                realtimeEventPublisher.publishUserEvent(event.getRecipientUserId(), response);
                return;
            }
            realtimeEventPublisher.publishChannelEvent(event.getChannelId(), response);
        });
    }

    private WebSocketEventResponse queueChannelEvent(
            Long entrepriseId,
            Long actorId,
            UUID channelId,
            String type,
            Object payload
    ) {
        return saveAndQueue(entrepriseId, RealtimeEventScope.CHANNEL, null, channelId, actorId, type, payload);
    }

    private WebSocketEventResponse queueUserEvent(
            Long entrepriseId,
            Long recipientUserId,
            UUID channelId,
            Long actorId,
            String type,
            Object payload
    ) {
        return saveAndQueue(entrepriseId, RealtimeEventScope.USER, recipientUserId, channelId, actorId, type, payload);
    }

    private WebSocketEventResponse saveAndQueue(
            Long entrepriseId,
            RealtimeEventScope scope,
            Long recipientUserId,
            UUID channelId,
            Long actorId,
            String type,
            Object payload
    ) {
        WebSocketEventResponse event = directEvent(entrepriseId, channelId, actorId, type, payload);
        Instant now = event.createdAt();

        CommEventStream row = new CommEventStream();
        row.setEventId(event.eventId());
        row.setEntrepriseId(entrepriseId);
        row.setScope(scope);
        row.setRecipientUserId(recipientUserId);
        row.setChannelId(channelId);
        row.setActorId(actorId);
        row.setType(type);
        row.setPayload(writePayload(payload));
        row.setCreatedAt(now);
        row.setReplayAvailableUntil(now.plusSeconds(communicationProperties.getReplay().getRetentionDays() * 86400L));
        eventStreamRepository.save(row);

        outboxService.recordPending(
                entrepriseId,
                "REALTIME_EVENT",
                event.eventId().toString(),
                "websocket.fanout",
                "websocket.fanout:" + event.eventId(),
                Map.of("eventId", event.eventId())
        );
        return event;
    }

    private WebSocketEventResponse directEvent(Long entrepriseId, UUID channelId, Long actorId, String type, Object payload) {
        return WebSocketEventResponse.builder()
                .eventId(orderedUuidGenerator.next())
                .type(type)
                .entrepriseId(entrepriseId)
                .channelId(channelId)
                .actorId(actorId)
                .data(payload)
                .createdAt(Instant.now())
                .build();
    }

    private WebSocketEventResponse toEventResponse(CommEventStream event) {
        return WebSocketEventResponse.builder()
                .eventId(event.getEventId())
                .type(event.getType())
                .entrepriseId(event.getEntrepriseId())
                .channelId(event.getChannelId())
                .actorId(event.getActorId())
                .data(readPayload(event.getPayload()))
                .createdAt(event.getCreatedAt())
                .build();
    }

    private String writePayload(Object payload) {
        try {
            return payload == null ? "{}" : objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            return "{}";
        }
    }

    private Object readPayload(String payload) {
        try {
            return payload == null || payload.isBlank()
                    ? Map.of()
                    : objectMapper.readValue(payload, Object.class);
        } catch (Exception exception) {
            return Map.of();
        }
    }
}
