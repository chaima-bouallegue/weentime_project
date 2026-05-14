package com.weentime.communication.dto;

import lombok.Builder;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Builder
public record MessageResponse(
        UUID id,
        UUID channelId,
        Long entrepriseId,
        SenderSummary sender,
        String type,
        String body,
        String richBody,
        UUID parentMessageId,
        MessageThreadSummary thread,
        List<ReactionSummary> reactions,
        List<AttachmentResponse> attachments,
        String status,
        String clientMessageId,
        Instant createdAt,
        Instant editedAt,
        Instant pinnedAt
) {
}
