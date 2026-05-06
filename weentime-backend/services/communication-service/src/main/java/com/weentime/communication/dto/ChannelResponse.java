package com.weentime.communication.dto;

import lombok.Builder;

import java.time.Instant;
import java.util.UUID;

@Builder
public record ChannelResponse(
        UUID id,
        Long entrepriseId,
        String type,
        String visibility,
        String slug,
        String name,
        String description,
        Long equipeId,
        String workflowType,
        String workflowEntityType,
        String workflowEntityId,
        boolean isPrivate,
        boolean isArchived,
        long memberCount,
        long unreadCount,
        MessageResponse lastMessage,
        ChannelPermissionResponse permissions,
        Instant createdAt,
        Instant updatedAt
) {
}
