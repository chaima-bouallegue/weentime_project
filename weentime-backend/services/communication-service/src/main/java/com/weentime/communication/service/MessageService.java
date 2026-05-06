package com.weentime.communication.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.communication.config.CommunicationProperties;
import com.weentime.communication.dto.CursorMessagePageResponse;
import com.weentime.communication.dto.MessageResponse;
import com.weentime.communication.dto.OrganisationUserSummary;
import com.weentime.communication.dto.ReadMarkerResponse;
import com.weentime.communication.dto.SendMessageRequest;
import com.weentime.communication.dto.UpdateMessageRequest;
import com.weentime.communication.entity.ChannelMemberRole;
import com.weentime.communication.entity.CommChannel;
import com.weentime.communication.entity.CommChannelMember;
import com.weentime.communication.entity.CommMessage;
import com.weentime.communication.entity.CommMessageHistory;
import com.weentime.communication.entity.CommReaction;
import com.weentime.communication.entity.CommReactionId;
import com.weentime.communication.entity.CommThread;
import com.weentime.communication.entity.MessageStatus;
import com.weentime.communication.entity.MessageType;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.mapper.CommunicationMapper;
import com.weentime.communication.repository.CommChannelMemberRepository;
import com.weentime.communication.repository.CommMessageHistoryRepository;
import com.weentime.communication.repository.CommMessageRepository;
import com.weentime.communication.repository.CommReactionRepository;
import com.weentime.communication.repository.CommThreadRepository;
import com.weentime.communication.security.CommunicationUserPrincipal;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MessageService {

    private static final Logger log = LoggerFactory.getLogger(MessageService.class);

    private final CommMessageRepository messageRepository;
    private final CommReactionRepository reactionRepository;
    private final CommThreadRepository threadRepository;
    private final CommChannelMemberRepository channelMemberRepository;
    private final CommMessageHistoryRepository messageHistoryRepository;
    private final MembershipService membershipService;
    private final UserDirectoryService userDirectoryService;
    private final CommunicationMapper mapper;
    private final ChannelService channelService;
    private final AuditService auditService;
    private final RealtimeEventService realtimeEventService;
    private final UnreadService unreadService;
    private final NotificationDispatchService notificationDispatchService;
    private final CommunicationProperties communicationProperties;
    private final ObjectMapper objectMapper;
    private final Map<String, Instant> typingThrottle = new ConcurrentHashMap<>();

    @Transactional(readOnly = true)
    public CursorMessagePageResponse getMessages(UUID channelId, Integer limit, String before, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        membershipService.assertActiveMember(channelId, currentUser);
        int pageSize = Math.min(Math.max(limit == null ? 30 : limit, 1), 100);

        CommMessage beforeMessage = null;
        if (before != null && !before.isBlank()) {
            UUID beforeId = parseUuid(before, "before");
            beforeMessage = messageRepository.findByIdAndEntrepriseId(beforeId, currentUser.entrepriseId())
                    .orElseThrow(() -> new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_CURSOR_INVALID",
                            "The provided cursor is invalid.", Map.of("before", before)));
            if (!Objects.equals(beforeMessage.getChannelId(), channelId)) {
                throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_CURSOR_INVALID",
                        "The provided cursor does not belong to this channel.", Map.of("before", before));
            }
        }

        List<CommMessage> rows = beforeMessage == null
                ? messageRepository.findInitialPage(
                        currentUser.entrepriseId(),
                        channelId,
                        PageRequest.of(0, pageSize + 1)
                )
                : messageRepository.findBeforePage(
                        currentUser.entrepriseId(),
                        channelId,
                        beforeMessage.getCreatedAt(),
                        beforeMessage.getId(),
                        PageRequest.of(0, pageSize + 1)
                );

        boolean hasMore = rows.size() > pageSize;
        List<CommMessage> pageRows = hasMore ? rows.subList(0, pageSize) : rows;
        String nextCursor = hasMore && !pageRows.isEmpty() ? pageRows.get(pageRows.size() - 1).getId().toString() : null;

        List<MessageResponse> items = new ArrayList<>(mapMessages(pageRows, currentUser));
        java.util.Collections.reverse(items);

        return CursorMessagePageResponse.builder()
                .items(items)
                .nextCursor(nextCursor)
                .hasMore(hasMore)
                .build();
    }

    @Transactional
    public MessageResponse sendMessage(UUID channelId, SendMessageRequest request, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        CommChannel channel = membershipService.getChannelOrThrow(channelId, currentUser.entrepriseId());
        CommChannelMember member = membershipService.assertActiveMember(channelId, currentUser);
        membershipService.assertCanWrite(channel, member);

        MessageType type = parseMessageType(request.type());
        validateMessagePayload(type, request.body(), request.richBody());

        if (request.clientMessageId() != null && !request.clientMessageId().isBlank()) {
            CommMessage existing = messageRepository.findByEntrepriseIdAndSenderIdAndClientMessageId(
                    currentUser.entrepriseId(), currentUser.userId(), request.clientMessageId()).orElse(null);
            if (existing != null) {
                return hydrateMessage(existing, currentUser);
            }
        }

        CommMessage parentMessage = null;
        if (request.parentMessageId() != null) {
            parentMessage = messageRepository.findByIdAndEntrepriseId(request.parentMessageId(), currentUser.entrepriseId())
                    .orElseThrow(() -> new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_PARENT_MESSAGE_NOT_FOUND",
                            "The parent message could not be found.", Map.of("parentMessageId", request.parentMessageId())));
            if (!Objects.equals(parentMessage.getChannelId(), channelId)) {
                throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_PARENT_MESSAGE_INVALID",
                        "The parent message belongs to a different channel.", Map.of("parentMessageId", request.parentMessageId()));
            }
        }

        Instant now = Instant.now();
        CommMessage message = new CommMessage();
        message.setEntrepriseId(currentUser.entrepriseId());
        message.setChannelId(channelId);
        message.setSenderId(currentUser.userId());
        message.setParentMessageId(request.parentMessageId());
        message.setType(type);
        message.setBody(request.body());
        message.setRichBody(request.richBody());
        message.setStatus(MessageStatus.ACTIVE);
        message.setClientMessageId(blankToNull(request.clientMessageId()));
        message.setMetadata(writeMetadata(request.metadata()));
        message.setCreatedAt(now);
        message.setUpdatedAt(now);
        message = messageRepository.save(message);

        if (parentMessage != null) {
            updateThreadAggregate(parentMessage, message, now);
        }

        member.setLastReadMessageId(message.getId());
        member.setLastReadAt(message.getCreatedAt());
        channelMemberRepository.save(member);
        channelService.touchChannel(channelId);

        MessageResponse response = hydrateMessage(message, currentUser);
        List<CommChannelMember> activeMembers = membershipService.getActiveMembers(channelId);
        realtimeEventService.publishMessageCreated(currentUser.entrepriseId(), currentUser.userId(), channelId, response);
        notificationDispatchService.queueMessageNotifications(channel, activeMembers, response, request.mentions());
        activeMembers.stream()
                .map(activeMember -> activeMember.getId().getUserId())
                .filter(userId -> !Objects.equals(userId, currentUser.userId()))
                .forEach(userId -> unreadService.publishUnreadUpdated(currentUser.entrepriseId(), currentUser.userId(), userId));
        auditService.record(currentUser.entrepriseId(), currentUser.userId(), "MESSAGE", message.getId().toString(),
                "message.created", auditPayload(
                        "channelId", channelId,
                        "clientMessageId", message.getClientMessageId()
                ));
        return response;
    }

    @Transactional
    public MessageResponse updateMessage(UUID messageId, UpdateMessageRequest request, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        CommMessage message = messageRepository.findByIdAndEntrepriseId(messageId, currentUser.entrepriseId())
                .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "COMM_MESSAGE_NOT_FOUND",
                        "The requested message could not be found.", Map.of("messageId", messageId)));
        CommChannel channel = membershipService.getChannelOrThrow(message.getChannelId(), currentUser.entrepriseId());
        CommChannelMember member = membershipService.assertActiveMember(message.getChannelId(), currentUser);
        assertCanEdit(message, member, currentUser);
        if (message.getDeletedAt() != null || message.getStatus() == MessageStatus.DELETED) {
            throw new CommunicationException(HttpStatus.CONFLICT, "COMM_MESSAGE_DELETED",
                    "Deleted messages cannot be edited.", Map.of("messageId", messageId));
        }

        validateMessagePayload(message.getType(), request.body(), request.richBody());
        if (Objects.equals(message.getBody(), request.body()) && Objects.equals(message.getRichBody(), request.richBody())) {
            return hydrateMessage(message, currentUser);
        }

        Instant now = Instant.now();
        CommMessageHistory history = new CommMessageHistory();
        history.setMessageId(message.getId());
        history.setEntrepriseId(message.getEntrepriseId());
        history.setEditedBy(currentUser.userId());
        history.setPreviousBody(message.getBody());
        history.setPreviousRichBody(message.getRichBody());
        history.setEditedAt(now);
        history.setReason(blankToNull(request.reason()));
        messageHistoryRepository.save(history);

        message.setBody(request.body());
        message.setRichBody(request.richBody());
        message.setStatus(MessageStatus.EDITED);
        message.setEditedAt(now);
        message.setUpdatedAt(now);
        messageRepository.save(message);
        channelService.touchChannel(channel.getId());

        MessageResponse response = hydrateMessage(message, currentUser);
        realtimeEventService.publishMessageUpdated(currentUser.entrepriseId(), currentUser.userId(), channel.getId(), response);
        auditService.record(currentUser.entrepriseId(), currentUser.userId(), "MESSAGE", message.getId().toString(),
                "message.updated", auditPayload(
                        "channelId", channel.getId(),
                        "reason", request.reason()
                ));
        return response;
    }

    @Transactional
    public MessageResponse deleteMessage(UUID messageId, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        CommMessage message = messageRepository.findByIdAndEntrepriseId(messageId, currentUser.entrepriseId())
                .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "COMM_MESSAGE_NOT_FOUND",
                        "The requested message could not be found.", Map.of("messageId", messageId)));
        CommChannel channel = membershipService.getChannelOrThrow(message.getChannelId(), currentUser.entrepriseId());
        CommChannelMember member = membershipService.assertActiveMember(message.getChannelId(), currentUser);
        assertCanDelete(message, member, currentUser);

        if (message.getDeletedAt() == null) {
            Instant now = Instant.now();
            message.setStatus(MessageStatus.DELETED);
            message.setDeletedAt(now);
            message.setDeletedBy(currentUser.userId());
            message.setUpdatedAt(now);
            messageRepository.save(message);
            channelService.touchChannel(channel.getId());
        }

        MessageResponse response = hydrateMessage(message, currentUser);
        realtimeEventService.publishMessageDeleted(currentUser.entrepriseId(), currentUser.userId(), channel.getId(), response);
        membershipService.getActiveMembers(channel.getId()).stream()
                .map(activeMember -> activeMember.getId().getUserId())
                .forEach(userId -> unreadService.publishUnreadUpdated(currentUser.entrepriseId(), currentUser.userId(), userId));
        auditService.record(currentUser.entrepriseId(), currentUser.userId(), "MESSAGE", message.getId().toString(),
                "message.deleted", Map.of("channelId", channel.getId()));
        return response;
    }

    @Transactional
    public MessageResponse addReaction(UUID messageId, String emoji, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        CommMessage message = messageRepository.findByIdAndEntrepriseId(messageId, currentUser.entrepriseId())
                .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "COMM_MESSAGE_NOT_FOUND",
                        "The requested message could not be found.", Map.of("messageId", messageId)));
        membershipService.assertActiveMember(message.getChannelId(), currentUser);

        String normalizedEmoji = normalizeEmoji(emoji);
        CommReactionId reactionId = new CommReactionId(messageId, currentUser.userId(), normalizedEmoji);
        if (!reactionRepository.existsById(reactionId)) {
            CommReaction reaction = new CommReaction();
            reaction.setId(reactionId);
            reaction.setEntrepriseId(currentUser.entrepriseId());
            reaction.setCreatedAt(Instant.now());
            reactionRepository.save(reaction);
        }

        MessageResponse response = hydrateMessage(message, currentUser);
        realtimeEventService.publishReactionAdded(
                currentUser.entrepriseId(),
                currentUser.userId(),
                message.getChannelId(),
                messageId,
                normalizedEmoji,
                response
        );
        auditService.record(currentUser.entrepriseId(), currentUser.userId(), "MESSAGE", messageId.toString(),
                "reaction.added", Map.of("emoji", normalizedEmoji));
        return response;
    }

    @Transactional
    public MessageResponse removeReaction(UUID messageId, String emoji, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        CommMessage message = messageRepository.findByIdAndEntrepriseId(messageId, currentUser.entrepriseId())
                .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "COMM_MESSAGE_NOT_FOUND",
                        "The requested message could not be found.", Map.of("messageId", messageId)));
        membershipService.assertActiveMember(message.getChannelId(), currentUser);

        String normalizedEmoji = normalizeEmoji(emoji);
        CommReactionId reactionId = new CommReactionId(messageId, currentUser.userId(), normalizedEmoji);
        if (reactionRepository.existsById(reactionId)) {
            reactionRepository.deleteById(reactionId);
        }

        MessageResponse response = hydrateMessage(message, currentUser);
        realtimeEventService.publishReactionRemoved(
                currentUser.entrepriseId(),
                currentUser.userId(),
                message.getChannelId(),
                messageId,
                normalizedEmoji,
                response
        );
        auditService.record(currentUser.entrepriseId(), currentUser.userId(), "MESSAGE", messageId.toString(),
                "reaction.removed", Map.of("emoji", normalizedEmoji));
        return response;
    }

    @Transactional
    public ReadMarkerResponse markRead(UUID messageId, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        return unreadService.markMessageRead(messageId, currentUser);
    }

    @Transactional
    public void publishTyping(UUID channelId, CommunicationUserPrincipal currentUser, boolean typing) {
        assertTenantContext(currentUser);
        membershipService.assertActiveMember(channelId, currentUser);
        if (typing && isTypingEventThrottled(channelId, currentUser.userId())) {
            return;
        }
        realtimeEventService.publishTyping(channelId, currentUser, typing);
    }

    private boolean isTypingEventThrottled(UUID channelId, Long userId) {
        long throttleMs = communicationProperties.getWebsocket().getTypingThrottleMs();
        if (throttleMs <= 0 || userId == null) {
            return false;
        }

        String key = channelId + ":" + userId;
        Instant now = Instant.now();
        Instant lastEventAt = typingThrottle.get(key);
        if (lastEventAt != null && lastEventAt.plusMillis(throttleMs).isAfter(now)) {
            return true;
        }
        typingThrottle.put(key, now);
        return false;
    }

    private List<MessageResponse> mapMessages(List<CommMessage> messages, CommunicationUserPrincipal currentUser) {
        if (messages.isEmpty()) {
            return List.of();
        }

        Set<Long> userIds = messages.stream()
                .map(CommMessage::getSenderId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, OrganisationUserSummary> users = resolveSenderSummaries(currentUser, userIds);

        List<UUID> messageIds = messages.stream().map(CommMessage::getId).toList();
        Map<UUID, List<CommReaction>> reactionsByMessage = reactionRepository.findById_MessageIdIn(messageIds).stream()
                .collect(Collectors.groupingBy(reaction -> reaction.getId().getMessageId()));
        Map<UUID, CommThread> threadsByRoot = threadRepository.findByRootMessageIdIn(messageIds).stream()
                .collect(Collectors.toMap(CommThread::getRootMessageId, thread -> thread));

        return messages.stream()
                .map(message -> mapper.toMessageResponse(
                        message,
                        users.get(message.getSenderId()),
                        reactionsByMessage.getOrDefault(message.getId(), List.of()),
                        threadsByRoot.get(message.getId()),
                        currentUser.userId()
                ))
                .toList();
    }

    private MessageResponse hydrateMessage(CommMessage message, CommunicationUserPrincipal currentUser) {
        Map<Long, OrganisationUserSummary> users = message.getSenderId() == null
                ? Map.of()
                : resolveSenderSummaries(currentUser, List.of(message.getSenderId()));
        return mapper.toMessageResponse(
                message,
                users.get(message.getSenderId()),
                reactionRepository.findById_MessageId(message.getId()),
                threadRepository.findByRootMessageIdAndEntrepriseId(message.getId(), message.getEntrepriseId()).orElse(null),
                currentUser.userId()
        );
    }

    private void updateThreadAggregate(CommMessage parentMessage, CommMessage reply, Instant now) {
        CommThread thread = threadRepository.findByRootMessageIdAndEntrepriseId(parentMessage.getId(), parentMessage.getEntrepriseId())
                .orElseGet(() -> {
                    CommThread created = new CommThread();
                    created.setRootMessageId(parentMessage.getId());
                    created.setEntrepriseId(parentMessage.getEntrepriseId());
                    created.setChannelId(parentMessage.getChannelId());
                    created.setReplyCount(0);
                    created.setParticipantCount(0);
                    created.setUpdatedAt(now);
                    return created;
                });
        thread.setReplyCount(thread.getReplyCount() + 1);
        thread.setParticipantCount(thread.getParticipantCount() + 1);
        thread.setLastReplyId(reply.getId());
        thread.setLastReplyAt(reply.getCreatedAt());
        thread.setUpdatedAt(now);
        threadRepository.save(thread);
    }

    private Map<Long, OrganisationUserSummary> resolveSenderSummaries(
            CommunicationUserPrincipal currentUser,
            java.util.Collection<Long> userIds
    ) {
        try {
            return userDirectoryService.getUserSummaries(currentUser, userIds);
        } catch (CommunicationException exception) {
            log.warn(
                    "Unable to resolve message senders, using sender id fallback. entrepriseId={}, userId={}, senderIds={}, code={}, message={}",
                    currentUser.entrepriseId(),
                    currentUser.userId(),
                    userIds,
                    exception.getCode(),
                    exception.getMessage()
            );
            return Map.of();
        }
    }

    private void assertCanEdit(CommMessage message, CommChannelMember member, CommunicationUserPrincipal currentUser) {
        if (!Objects.equals(message.getSenderId(), currentUser.userId())) {
            throw new CommunicationException(HttpStatus.FORBIDDEN, "COMM_MESSAGE_EDIT_FORBIDDEN",
                    "Only the original sender can edit this message.", Map.of("messageId", message.getId()));
        }
        membershipService.assertCanWrite(member.getChannel(), member);
    }

    private void assertCanDelete(CommMessage message, CommChannelMember member, CommunicationUserPrincipal currentUser) {
        boolean moderator = member.getRole() == ChannelMemberRole.OWNER || member.getRole() == ChannelMemberRole.ADMIN;
        if (!Objects.equals(message.getSenderId(), currentUser.userId()) && !moderator) {
            throw new CommunicationException(HttpStatus.FORBIDDEN, "COMM_MESSAGE_DELETE_FORBIDDEN",
                    "You cannot delete this message.", Map.of("messageId", message.getId()));
        }
    }

    private MessageType parseMessageType(String rawType) {
        if (rawType == null || rawType.isBlank()) {
            return MessageType.TEXT;
        }
        try {
            return MessageType.valueOf(rawType.trim().toUpperCase());
        } catch (Exception exception) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_MESSAGE_TYPE_INVALID",
                    "Unsupported message type.", Map.of("type", rawType));
        }
    }

    private void validateMessagePayload(MessageType type, String body, String richBody) {
        if (type == MessageType.TEXT) {
            boolean hasBody = body != null && !body.isBlank();
            boolean hasRichBody = richBody != null && !richBody.isBlank();
            if (!hasBody && !hasRichBody) {
                throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_MESSAGE_BODY_REQUIRED",
                        "A text message must include a body.", Map.of());
            }
        }
    }

    private String normalizeEmoji(String emoji) {
        if (emoji == null || emoji.isBlank()) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_REACTION_EMOJI_REQUIRED",
                    "An emoji is required for reactions.", Map.of());
        }
        return emoji.trim();
    }

    private UUID parseUuid(String value, String field) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_UUID_INVALID",
                    "The supplied identifier is invalid.", Map.of(field, value));
        }
    }

    private String writeMetadata(Map<String, Object> metadata) {
        try {
            return metadata == null || metadata.isEmpty() ? "{}" : objectMapper.writeValueAsString(metadata);
        } catch (JsonProcessingException exception) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_MESSAGE_METADATA_INVALID",
                    "The message metadata could not be serialized.", Map.of());
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void assertTenantContext(CommunicationUserPrincipal currentUser) {
        if (currentUser == null || currentUser.entrepriseId() == null) {
            throw new CommunicationException(HttpStatus.FORBIDDEN, "COMM_TENANT_REQUIRED",
                    "Communication requires an assigned entreprise.", auditPayload(
                            "userId", currentUser == null ? null : currentUser.userId()
                    ));
        }
    }

    private Map<String, Object> auditPayload(Object... keysAndValues) {
        Map<String, Object> payload = new LinkedHashMap<>();
        for (int index = 0; index + 1 < keysAndValues.length; index += 2) {
            Object value = keysAndValues[index + 1];
            if (value != null) {
                payload.put(String.valueOf(keysAndValues[index]), value);
            }
        }
        return payload;
    }
}
