package com.weentime.communication.service;

import com.weentime.communication.dto.ChannelResponse;
import com.weentime.communication.dto.CreateChannelRequest;
import com.weentime.communication.dto.CreateWorkflowChannelRequest;
import com.weentime.communication.dto.MessageResponse;
import com.weentime.communication.dto.OrganisationUserSummary;
import com.weentime.communication.dto.OpenDirectRequest;
import com.weentime.communication.entity.ChannelMemberRole;
import com.weentime.communication.entity.ChannelType;
import com.weentime.communication.entity.ChannelVisibility;
import com.weentime.communication.entity.CommChannel;
import com.weentime.communication.entity.CommChannelMember;
import com.weentime.communication.entity.CommChannelMemberId;
import com.weentime.communication.entity.CommDirectChannelParticipant;
import com.weentime.communication.entity.CommMessage;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.mapper.CommunicationMapper;
import com.weentime.communication.repository.CommChannelMemberRepository;
import com.weentime.communication.repository.CommChannelRepository;
import com.weentime.communication.repository.CommDirectChannelParticipantRepository;
import com.weentime.communication.repository.CommMessageRepository;
import com.weentime.communication.repository.CommReactionRepository;
import com.weentime.communication.repository.CommThreadRepository;
import com.weentime.communication.security.CommunicationUserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChannelService {

    private static final String WORKFLOW_ENTITY_TYPE_DEMANDE = "DEMANDE";

    private final CommChannelRepository channelRepository;
    private final CommChannelMemberRepository channelMemberRepository;
    private final CommDirectChannelParticipantRepository directChannelParticipantRepository;
    private final CommMessageRepository messageRepository;
    private final CommReactionRepository reactionRepository;
    private final CommThreadRepository threadRepository;
    private final MembershipService membershipService;
    private final UserDirectoryService userDirectoryService;
    private final CommunicationProvisioningService provisioningService;
    private final CommunicationMapper mapper;
    private final AuditService auditService;

    @Transactional
    public List<ChannelResponse> listChannels(CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        List<CommChannelMember> visibleMemberships = channelMemberRepository.findVisibleMemberships(currentUser.entrepriseId(), currentUser.userId());
        if (visibleMemberships.isEmpty()) {
            provisioningService.ensureEnterpriseBootstrapForUser(currentUser);
            visibleMemberships = channelMemberRepository.findVisibleMemberships(currentUser.entrepriseId(), currentUser.userId());
        }

        return visibleMemberships
                .stream()
                .map(CommChannelMember::getChannel)
                .filter(channel -> !channel.isArchived())
                .filter(channel -> Objects.equals(channel.getEntrepriseId(), currentUser.entrepriseId()))
                .map(channel -> buildChannelResponse(channel, currentUser))
                .sorted(Comparator.comparing(this::channelLastActivityAt).reversed())
                .toList();
    }

    @Transactional(readOnly = true)
    public ChannelResponse getChannel(UUID channelId, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        membershipService.assertActiveMember(channelId, currentUser);
        return buildChannelResponse(membershipService.getChannelOrThrow(channelId, currentUser.entrepriseId()), currentUser);
    }

    @Transactional(readOnly = true)
    public ChannelResponse getWorkflowChannel(String demandeId, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        CommChannel channel = channelRepository.findFirstByEntrepriseIdAndTypeAndWorkflowEntityTypeAndWorkflowEntityIdAndIsArchivedFalse(
                        currentUser.entrepriseId(),
                        ChannelType.PRIVATE_WORKFLOW,
                        WORKFLOW_ENTITY_TYPE_DEMANDE,
                        demandeId
                )
                .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "COMM_WORKFLOW_CHANNEL_NOT_FOUND",
                        "The workflow conversation could not be found.", Map.of("demandeId", demandeId)));
        membershipService.assertActiveMember(channel.getId(), currentUser);
        return buildChannelResponse(channel, currentUser);
    }

    @Transactional
    public ChannelResponse createChannel(CreateChannelRequest request, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        assertCanCreateChannel(currentUser);

        ChannelType type = parseChannelType(request.type());
        if (type == ChannelType.DIRECT || type == ChannelType.GROUP_DM || type == ChannelType.PRIVATE_WORKFLOW) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_CHANNEL_TYPE_UNSUPPORTED",
                    "This channel type must be created through its dedicated endpoint.", Map.of("type", request.type()));
        }

        Set<Long> memberIds = new LinkedHashSet<>();
        memberIds.add(currentUser.userId());
        if (request.memberIds() != null) {
            memberIds.addAll(request.memberIds());
        }

        Map<Long, OrganisationUserSummary> userSummaries = userDirectoryService.getUserSummaries(currentUser, memberIds);
        ensureEnterpriseMatch(userSummaries.values(), currentUser.entrepriseId());

        Instant now = Instant.now();
        CommChannel channel = new CommChannel();
        channel.setEntrepriseId(currentUser.entrepriseId());
        channel.setType(type);
        channel.setVisibility(parseVisibility(request.visibility(), type));
        channel.setSlug(blankToNull(request.slug()));
        channel.setName(request.name().trim());
        channel.setDescription(blankToNull(request.description()));
        channel.setEquipeId(request.equipeId());
        channel.setPrivate(Boolean.TRUE.equals(request.isPrivate()) || channel.getVisibility() == ChannelVisibility.PRIVATE);
        channel.setCreatedBy(currentUser.userId());
        channel.setCreatedAt(now);
        channel.setUpdatedAt(now);
        channel = channelRepository.save(channel);

        for (Long memberId : memberIds) {
            CommChannelMember member = new CommChannelMember();
            member.setId(new CommChannelMemberId(channel.getId(), memberId));
            member.setChannel(channel);
            member.setEntrepriseId(currentUser.entrepriseId());
            member.setRole(Objects.equals(memberId, currentUser.userId()) ? ChannelMemberRole.OWNER : ChannelMemberRole.MEMBER);
            member.setJoinedAt(now);
            channelMemberRepository.save(member);
        }

        auditService.record(currentUser.entrepriseId(), currentUser.userId(), "CHANNEL", channel.getId().toString(),
                "channel.created", Map.of("type", channel.getType().name(), "memberIds", memberIds));

        return buildChannelResponse(channel, currentUser);
    }

    @Transactional
    public ChannelResponse createWorkflowChannel(CreateWorkflowChannelRequest request, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        Set<Long> participantIds = new LinkedHashSet<>(request.participantIds());
        participantIds.add(currentUser.userId());

        Map<Long, OrganisationUserSummary> userSummaries = userDirectoryService.getUserSummaries(currentUser, participantIds);
        ensureEnterpriseMatch(userSummaries.values(), currentUser.entrepriseId());
        boolean hasInactiveParticipant = userSummaries.values().stream().anyMatch(summary -> !summary.active());
        if (hasInactiveParticipant) {
            throw new CommunicationException(HttpStatus.CONFLICT, "COMM_WORKFLOW_PARTICIPANT_INACTIVE",
                    "Inactive users cannot be added to a workflow conversation.", Map.of("demandeId", request.demandeId()));
        }

        CommChannel existing = channelRepository.findFirstByEntrepriseIdAndTypeAndWorkflowEntityTypeAndWorkflowEntityIdAndIsArchivedFalse(
                        currentUser.entrepriseId(),
                        ChannelType.PRIVATE_WORKFLOW,
                        WORKFLOW_ENTITY_TYPE_DEMANDE,
                        request.demandeId()
                )
                .orElse(null);
        if (existing != null) {
            membershipService.assertActiveMember(existing.getId(), currentUser);
            return buildChannelResponse(existing, currentUser);
        }

        Instant now = Instant.now();
        CommChannel channel = new CommChannel();
        channel.setEntrepriseId(currentUser.entrepriseId());
        channel.setType(ChannelType.PRIVATE_WORKFLOW);
        channel.setVisibility(ChannelVisibility.WORKFLOW);
        channel.setName(request.name().trim());
        channel.setDescription(blankToNull(request.description()));
        channel.setWorkflowType(blankToNull(request.workflowType()));
        channel.setWorkflowEntityType(WORKFLOW_ENTITY_TYPE_DEMANDE);
        channel.setWorkflowEntityId(request.demandeId().trim());
        channel.setPrivate(true);
        channel.setCreatedBy(currentUser.userId());
        channel.setCreatedAt(now);
        channel.setUpdatedAt(now);
        channel = channelRepository.save(channel);

        for (Long participantId : participantIds) {
            CommChannelMember member = new CommChannelMember();
            member.setId(new CommChannelMemberId(channel.getId(), participantId));
            member.setChannel(channel);
            member.setEntrepriseId(currentUser.entrepriseId());
            member.setRole(Objects.equals(participantId, currentUser.userId()) ? ChannelMemberRole.OWNER : ChannelMemberRole.MEMBER);
            member.setJoinedAt(now);
            channelMemberRepository.save(member);
        }

        auditService.record(currentUser.entrepriseId(), currentUser.userId(), "CHANNEL", channel.getId().toString(),
                "workflow.channel.created", Map.of(
                        "demandeId", request.demandeId(),
                        "participantIds", participantIds
                ));
        return buildChannelResponse(channel, currentUser);
    }

    @Transactional
    public ChannelResponse openDirect(OpenDirectRequest request, CommunicationUserPrincipal currentUser) {
        assertTenantContext(currentUser);
        if (Objects.equals(request.userId(), currentUser.userId())) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_DIRECT_SELF_NOT_ALLOWED",
                    "You cannot open a direct channel with yourself.", Map.of("userId", request.userId()));
        }

        Map<Long, OrganisationUserSummary> users = userDirectoryService.getUserSummaries(currentUser,
                List.of(currentUser.userId(), request.userId()));
        ensureEnterpriseMatch(users.values(), currentUser.entrepriseId());
        if (users.values().stream().anyMatch(summary -> !summary.active())) {
            throw new CommunicationException(HttpStatus.CONFLICT, "COMM_DIRECT_USER_INACTIVE",
                    "Inactive users cannot be added to direct conversations.", Map.of("userId", request.userId()));
        }

        String participantHash = participantHash(List.of(currentUser.userId(), request.userId()));
        CommDirectChannelParticipant existing = directChannelParticipantRepository
                .findByEntrepriseIdAndParticipantHash(currentUser.entrepriseId(), participantHash)
                .orElse(null);
        if (existing != null) {
            return getChannel(existing.getChannelId(), currentUser);
        }

        Instant now = Instant.now();
        OrganisationUserSummary targetUser = users.get(request.userId());
        CommChannel channel = new CommChannel();
        channel.setEntrepriseId(currentUser.entrepriseId());
        channel.setType(ChannelType.DIRECT);
        channel.setVisibility(ChannelVisibility.PRIVATE);
        channel.setName(targetUser.resolvedFullName());
        channel.setPrivate(true);
        channel.setCreatedBy(currentUser.userId());
        channel.setCreatedAt(now);
        channel.setUpdatedAt(now);
        channel = channelRepository.save(channel);

        List<Long> participantIds = List.of(currentUser.userId(), request.userId());
        for (Long participantId : participantIds) {
            CommChannelMember member = new CommChannelMember();
            member.setId(new CommChannelMemberId(channel.getId(), participantId));
            member.setChannel(channel);
            member.setEntrepriseId(currentUser.entrepriseId());
            member.setRole(ChannelMemberRole.MEMBER);
            member.setJoinedAt(now);
            channelMemberRepository.save(member);
        }

        CommDirectChannelParticipant participant = new CommDirectChannelParticipant();
        participant.setChannelId(channel.getId());
        participant.setEntrepriseId(currentUser.entrepriseId());
        participant.setParticipantHash(participantHash);
        participant.setParticipantCount(participantIds.size());
        directChannelParticipantRepository.save(participant);

        auditService.record(currentUser.entrepriseId(), currentUser.userId(), "CHANNEL", channel.getId().toString(),
                "direct.opened", Map.of("participantIds", participantIds));

        return buildChannelResponse(channel, currentUser);
    }

    @Transactional
    public void touchChannel(UUID channelId) {
        CommChannel channel = channelRepository.findById(channelId).orElseThrow();
        channel.setUpdatedAt(Instant.now());
        channelRepository.save(channel);
    }

    private ChannelResponse buildChannelResponse(CommChannel channel, CommunicationUserPrincipal currentUser) {
        CommChannelMember membership = membershipService.assertActiveMember(channel.getId(), currentUser);
        List<CommChannelMember> activeMembers = membershipService.getActiveMembers(channel.getId());
        Set<Long> userIds = activeMembers.stream().map(member -> member.getId().getUserId()).collect(Collectors.toCollection(LinkedHashSet::new));

        CommMessage lastMessageEntity = messageRepository.findFirstByEntrepriseIdAndChannelIdOrderByCreatedAtDescIdDesc(
                channel.getEntrepriseId(), channel.getId()).orElse(null);
        if (lastMessageEntity != null && lastMessageEntity.getSenderId() != null) {
            userIds.add(lastMessageEntity.getSenderId());
        }

        Map<Long, OrganisationUserSummary> userSummaries = userDirectoryService.getUserSummaries(currentUser, userIds);
        MessageResponse lastMessage = lastMessageEntity == null ? null : mapper.toMessageResponse(
                lastMessageEntity,
                userSummaries.get(lastMessageEntity.getSenderId()),
                reactionRepository.findById_MessageId(lastMessageEntity.getId()),
                threadRepository.findByRootMessageIdAndEntrepriseId(lastMessageEntity.getId(), channel.getEntrepriseId()).orElse(null),
                currentUser.userId()
        );

        long unreadCount = countUnread(channel.getEntrepriseId(), channel.getId(), currentUser.userId(),
                membership.getLastReadAt(), membership.getLastReadMessageId());
        return mapper.toChannelResponse(
                channel,
                activeMembers,
                lastMessage,
                unreadCount,
                membershipService.permissionsFor(channel, membership),
                userSummaries,
                currentUser.userId()
        );
    }

    private void assertCanCreateChannel(CommunicationUserPrincipal currentUser) {
        Set<String> roles = normalizeRoles(currentUser.roles());
        if (!(roles.contains("ADMIN") || roles.contains("RH") || roles.contains("MANAGER"))) {
            throw new CommunicationException(HttpStatus.FORBIDDEN, "COMM_CHANNEL_CREATE_FORBIDDEN",
                    "You are not allowed to create channels.", Map.of());
        }
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

    private void ensureEnterpriseMatch(Collection<OrganisationUserSummary> users, Long entrepriseId) {
        boolean valid = users.stream().allMatch(user -> Objects.equals(user.entrepriseId(), entrepriseId));
        if (!valid) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_TENANT_MISMATCH",
                    "All conversation participants must belong to the same entreprise.", Map.of("entrepriseId", entrepriseId));
        }
    }

    private Set<String> normalizeRoles(List<String> roles) {
        if (roles == null) {
            return Set.of();
        }
        return roles.stream()
                .map(role -> {
                    String normalized = role == null ? "" : role.trim().toUpperCase();
                    return normalized.startsWith("ROLE_") ? normalized.substring("ROLE_".length()) : normalized;
                })
                .filter(role -> !role.isBlank())
                .collect(Collectors.toSet());
    }

    private ChannelType parseChannelType(String rawType) {
        try {
            return ChannelType.valueOf(rawType.trim().toUpperCase());
        } catch (Exception exception) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_CHANNEL_TYPE_INVALID",
                    "Unsupported channel type.", Map.of("type", rawType));
        }
    }

    private ChannelVisibility parseVisibility(String rawVisibility, ChannelType channelType) {
        if (rawVisibility == null || rawVisibility.isBlank()) {
            if (channelType == ChannelType.COMPANY || channelType == ChannelType.SMART
                    || channelType == ChannelType.TEAM || channelType == ChannelType.STANDARD) {
                return ChannelVisibility.PUBLIC;
            }
            return channelType == ChannelType.PRIVATE_WORKFLOW ? ChannelVisibility.WORKFLOW : ChannelVisibility.PRIVATE;
        }
        try {
            return ChannelVisibility.valueOf(rawVisibility.trim().toUpperCase());
        } catch (Exception exception) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_CHANNEL_VISIBILITY_INVALID",
                    "Unsupported channel visibility.", Map.of("visibility", rawVisibility));
        }
    }

    private String participantHash(List<Long> participantIds) {
        List<Long> sortedIds = new ArrayList<>(participantIds);
        sortedIds.sort(Comparator.naturalOrder());
        String source = sortedIds.stream().map(String::valueOf).collect(Collectors.joining(":"));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new CommunicationException(HttpStatus.INTERNAL_SERVER_ERROR, "COMM_HASH_ERROR",
                    "Unable to build the direct conversation identity.", Map.of());
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private Instant channelLastActivityAt(ChannelResponse channel) {
        return channel.lastMessage() != null && channel.lastMessage().createdAt() != null
                ? channel.lastMessage().createdAt()
                : channel.updatedAt();
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
}
