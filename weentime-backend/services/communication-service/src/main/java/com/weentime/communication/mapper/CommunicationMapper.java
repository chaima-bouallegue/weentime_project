package com.weentime.communication.mapper;

import com.weentime.communication.dto.ChannelPermissionResponse;
import com.weentime.communication.dto.ChannelResponse;
import com.weentime.communication.dto.MessageResponse;
import com.weentime.communication.dto.MessageThreadSummary;
import com.weentime.communication.dto.OrganisationUserSummary;
import com.weentime.communication.dto.ReactionSummary;
import com.weentime.communication.dto.SenderSummary;
import com.weentime.communication.entity.ChannelType;
import com.weentime.communication.entity.CommChannel;
import com.weentime.communication.entity.CommChannelMember;
import com.weentime.communication.entity.CommAttachment;
import com.weentime.communication.entity.CommMessage;
import com.weentime.communication.entity.CommReaction;
import com.weentime.communication.entity.CommThread;
import com.weentime.communication.dto.AttachmentResponse;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Component
public class CommunicationMapper {

    public ChannelResponse toChannelResponse(
            CommChannel channel,
            List<CommChannelMember> activeMembers,
            MessageResponse lastMessage,
            long pinnedCount,
            long unreadCount,
            ChannelPermissionResponse permissions,
            String notificationLevel,
            Map<Long, OrganisationUserSummary> userSummaries,
            Long currentUserId
    ) {
        return ChannelResponse.builder()
                .id(channel.getId())
                .entrepriseId(channel.getEntrepriseId())
                .type(channel.getType().name())
                .visibility(channel.getVisibility().name())
                .slug(channel.getSlug())
                .name(resolveChannelName(channel, activeMembers, userSummaries, currentUserId))
                .description(channel.getDescription())
                .equipeId(channel.getEquipeId())
                .workflowType(channel.getWorkflowType())
                .workflowEntityType(channel.getWorkflowEntityType())
                .workflowEntityId(channel.getWorkflowEntityId())
                .isPrivate(channel.isPrivate())
                .isArchived(channel.isArchived())
                .memberCount(activeMembers.size())
                .members(mapMembers(activeMembers, userSummaries))
                .pinnedCount(pinnedCount)
                .unreadCount(unreadCount)
                .lastMessage(lastMessage)
                .permissions(permissions)
                .notificationLevel(notificationLevel)
                .createdAt(channel.getCreatedAt())
                .updatedAt(channel.getUpdatedAt())
                .build();
    }

    public MessageResponse toMessageResponse(
            CommMessage message,
            OrganisationUserSummary sender,
            List<CommReaction> reactions,
            List<CommAttachment> attachments,
            CommThread thread,
            Long currentUserId
    ) {
        return MessageResponse.builder()
                .id(message.getId())
                .channelId(message.getChannelId())
                .entrepriseId(message.getEntrepriseId())
                .sender(toSenderSummary(sender, message.getSenderId()))
                .type(message.getType().name())
                .body(isDeleted(message) ? null : message.getBody())
                .richBody(message.getRichBody())
                .parentMessageId(message.getParentMessageId())
                .thread(toThreadSummary(thread))
                .reactions(toReactionSummaries(reactions, currentUserId))
                .attachments(toAttachmentResponses(attachments))
                .status(message.getStatus().name())
                .clientMessageId(message.getClientMessageId())
                .createdAt(message.getCreatedAt())
                .editedAt(message.getEditedAt())
                .pinnedAt(message.getPinnedAt())
                .build();
    }

    public SenderSummary toSenderSummary(OrganisationUserSummary sender, Long senderId) {
        if (sender == null) {
            return SenderSummary.builder()
                    .id(senderId)
                    .fullName(senderId == null ? "System" : "User #" + senderId)
                    .role(senderId == null ? "SYSTEM" : "EMPLOYEE")
                    .avatarUrl(null)
                    .build();
        }
        return SenderSummary.builder()
                .id(sender.id())
                .fullName(sender.resolvedFullName())
                .role(sender.primaryRole())
                .avatarUrl(sender.resolvedAvatarUrl())
                .build();
    }

    public MessageThreadSummary toThreadSummary(CommThread thread) {
        if (thread == null) {
            return null;
        }
        return MessageThreadSummary.builder()
                .replyCount(thread.getReplyCount())
                .lastReplyAt(thread.getLastReplyAt())
                .build();
    }

    public List<ReactionSummary> toReactionSummaries(List<CommReaction> reactions, Long currentUserId) {
        if (reactions == null || reactions.isEmpty()) {
            return List.of();
        }

        Map<String, List<CommReaction>> grouped = reactions.stream()
                .collect(Collectors.groupingBy(reaction -> reaction.getId().getEmoji(), LinkedHashMap::new, Collectors.toList()));

        List<ReactionSummary> summaries = new ArrayList<>();
        grouped.forEach((emoji, items) -> summaries.add(ReactionSummary.builder()
                .emoji(emoji)
                .count(items.size())
                .reactedByMe(items.stream().anyMatch(reaction -> Objects.equals(reaction.getId().getUserId(), currentUserId)))
                .build()));

        return summaries.stream().sorted(Comparator.comparing(ReactionSummary::emoji)).toList();
    }

    public List<AttachmentResponse> toAttachmentResponses(List<CommAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return List.of();
        }
        return attachments.stream()
                .map(attachment -> AttachmentResponse.builder()
                        .id(attachment.getId())
                        .fileName(attachment.getFileName())
                        .originalName(attachment.getOriginalName())
                        .contentType(attachment.getContentType())
                        .fileSize(attachment.getFileSize())
                        .url("/api/v1/communication/attachments/" + attachment.getId() + "/download")
                        .createdAt(attachment.getCreatedAt())
                        .build())
                .toList();
    }

    private boolean isDeleted(CommMessage message) {
        return message.getDeletedAt() != null || "DELETED".equals(message.getStatus().name());
    }

    private List<SenderSummary> mapMembers(List<CommChannelMember> members, Map<Long, OrganisationUserSummary> userSummaries) {
        if (members == null || members.isEmpty()) {
            return List.of();
        }
        return members.stream()
                .map(member -> toSenderSummary(userSummaries.get(member.getId().getUserId()), member.getId().getUserId()))
                .toList();
    }

    private String resolveChannelName(
            CommChannel channel,
            List<CommChannelMember> activeMembers,
            Map<Long, OrganisationUserSummary> userSummaries,
            Long currentUserId
    ) {
        if (channel.getType() == ChannelType.DIRECT) {
            return activeMembers.stream()
                    .map(member -> member.getId().getUserId())
                    .filter(userId -> !Objects.equals(userId, currentUserId))
                    .map(userSummaries::get)
                    .filter(Objects::nonNull)
                    .map(OrganisationUserSummary::resolvedFullName)
                    .findFirst()
                    .orElse(channel.getName());
        }
        return channel.getName();
    }
}
