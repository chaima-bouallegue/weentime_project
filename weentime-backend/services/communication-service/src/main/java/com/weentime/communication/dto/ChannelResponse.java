package com.weentime.communication.dto;

import lombok.Builder;

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
                java.util.List<SenderSummary> members,
                long pinnedCount,
                long unreadCount,
                MessageResponse lastMessage,
                ChannelPermissionResponse permissions,
                String notificationLevel,
                java.time.Instant createdAt,
                java.time.Instant updatedAt) {
}
