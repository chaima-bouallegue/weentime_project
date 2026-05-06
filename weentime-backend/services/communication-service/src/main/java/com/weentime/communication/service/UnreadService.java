package com.weentime.communication.service;

import com.weentime.communication.dto.MarkChannelReadRequest;
import com.weentime.communication.dto.ReadMarkerResponse;
import com.weentime.communication.dto.UnreadChannelSummaryResponse;
import com.weentime.communication.dto.UnreadSummaryResponse;
import com.weentime.communication.entity.CommChannelMember;
import com.weentime.communication.entity.CommMessage;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.repository.CommChannelMemberRepository;
import com.weentime.communication.repository.CommMessageRepository;
import com.weentime.communication.security.CommunicationUserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UnreadService {

    private final CommChannelMemberRepository channelMemberRepository;
    private final CommMessageRepository messageRepository;
    private final MembershipService membershipService;
    private final AuditService auditService;
    private final RealtimeEventService realtimeEventService;

    @Transactional
    public ReadMarkerResponse markChannelRead(UUID channelId, MarkChannelReadRequest request, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        CommChannelMember member = membershipService.assertActiveMember(channelId, currentUser);
        CommMessage latestVisibleMessage = resolveLatestVisibleMessage(channelId, request == null ? null : request.messageId(), currentUser);
        Instant readAt = latestVisibleMessage == null ? Instant.now() : latestVisibleMessage.getCreatedAt();
        UUID readMessageId = latestVisibleMessage == null ? null : latestVisibleMessage.getId();

        member.setLastReadMessageId(readMessageId);
        member.setLastReadAt(readAt);
        channelMemberRepository.save(member);

        ReadMarkerResponse response = ReadMarkerResponse.builder()
                .channelId(channelId)
                .messageId(readMessageId)
                .readAt(readAt)
                .build();

        auditService.record(currentUser.entrepriseId(), currentUser.userId(), "CHANNEL", channelId.toString(),
                "channel.read", payload("messageId", readMessageId));
        realtimeEventService.publishReadUpdated(
                currentUser.entrepriseId(),
                currentUser.userId(),
                channelId,
                readMessageId,
                currentUser.userId(),
                readAt
        );
        realtimeEventService.publishUnreadUpdated(
                currentUser.entrepriseId(),
                currentUser.userId(),
                currentUser.userId(),
                buildUnreadSummary(currentUser.entrepriseId(), currentUser.userId())
        );
        return response;
    }

    @Transactional
    public ReadMarkerResponse markMessageRead(UUID messageId, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        CommMessage message = messageRepository.findByIdAndEntrepriseId(messageId, currentUser.entrepriseId())
                .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "COMM_MESSAGE_NOT_FOUND",
                        "The requested message could not be found.", Map.of("messageId", messageId)));
        return markChannelRead(message.getChannelId(), new MarkChannelReadRequest(messageId), currentUser);
    }

    @Transactional(readOnly = true)
    public UnreadSummaryResponse getUnreadSummary(CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        return buildUnreadSummary(currentUser.entrepriseId(), currentUser.userId());
    }

    @Transactional(readOnly = true)
    public UnreadSummaryResponse buildUnreadSummary(Long entrepriseId, Long userId) {
        List<CommChannelMember> memberships = channelMemberRepository.findVisibleMemberships(entrepriseId, userId);
        List<UnreadChannelSummaryResponse> channels = memberships.stream()
                .map(member -> UnreadChannelSummaryResponse.builder()
                        .channelId(member.getChannel().getId())
                        .unreadCount(countUnread(
                                entrepriseId,
                                member.getChannel().getId(),
                                userId,
                                member.getLastReadAt(),
                                member.getLastReadMessageId()))
                        .build())
                .toList();

        long total = channels.stream().mapToLong(UnreadChannelSummaryResponse::unreadCount).sum();
        return UnreadSummaryResponse.builder()
                .totalUnread(total)
                .channels(channels)
                .build();
    }

    public void publishUnreadUpdated(Long entrepriseId, Long actorId, Long userId) {
        realtimeEventService.publishUnreadUpdated(entrepriseId, actorId, userId, buildUnreadSummary(entrepriseId, userId));
    }

    private CommMessage resolveLatestVisibleMessage(UUID channelId, UUID requestedMessageId, CommunicationUserPrincipal currentUser) {
        if (requestedMessageId != null) {
            CommMessage message = messageRepository.findByIdAndEntrepriseId(requestedMessageId, currentUser.entrepriseId())
                    .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "COMM_MESSAGE_NOT_FOUND",
                            "The requested message could not be found.", Map.of("messageId", requestedMessageId)));
            if (!message.getChannelId().equals(channelId)) {
                throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_MESSAGE_CHANNEL_MISMATCH",
                        "The supplied message does not belong to this channel.", Map.of("channelId", channelId, "messageId", requestedMessageId));
            }
            return message;
        }

        return messageRepository.findFirstByEntrepriseIdAndChannelIdAndDeletedAtIsNullOrderByCreatedAtDescIdDesc(
                currentUser.entrepriseId(),
                channelId
        ).orElse(null);
    }

    private long countUnread(Long entrepriseId, UUID channelId, Long userId, Instant lastReadAt, UUID lastReadMessageId) {
        if (lastReadAt == null) {
            return messageRepository.countUnreadAll(entrepriseId, channelId, userId);
        }
        if (lastReadMessageId == null) {
            return messageRepository.countUnreadAfterTimestamp(entrepriseId, channelId, userId, lastReadAt);
        }
        return messageRepository.countUnreadAfterTimestampAndMessage(
                entrepriseId,
                channelId,
                userId,
                lastReadAt,
                lastReadMessageId
        );
    }

    private void assertTenantContext(CommunicationUserPrincipal currentUser) {
        if (currentUser == null || currentUser.entrepriseId() == null) {
            throw new CommunicationException(HttpStatus.FORBIDDEN, "COMM_TENANT_REQUIRED",
                    "Communication requires an assigned entreprise.", payload(
                            "userId", currentUser == null ? null : currentUser.userId()
                    ));
        }
    }

    private Map<String, Object> payload(Object... keysAndValues) {
        Map<String, Object> values = new LinkedHashMap<>();
        for (int index = 0; index + 1 < keysAndValues.length; index += 2) {
            Object value = keysAndValues[index + 1];
            if (value != null) {
                values.put(String.valueOf(keysAndValues[index]), value);
            }
        }
        return values;
    }
}
