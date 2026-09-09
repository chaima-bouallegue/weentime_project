package com.weentime.communication.service;

import com.weentime.communication.dto.*;
import com.weentime.communication.entity.*;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.mapper.CommunicationMapper;
import com.weentime.communication.repository.*;
import com.weentime.communication.security.CommunicationUserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ChannelServiceTest {

    private CommChannelRepository channelRepository;
    private CommChannelMemberRepository channelMemberRepository;
    private CommDirectChannelParticipantRepository directChannelParticipantRepository;
    private CommMessageRepository messageRepository;
    private CommReactionRepository reactionRepository;
    private CommThreadRepository threadRepository;
    private MembershipService membershipService;
    private UserDirectoryService userDirectoryService;
    private CommAttachmentRepository attachmentRepository;
    private CommunicationProvisioningService provisioningService;
    private CommunicationMapper mapper;
    private AuditService auditService;

    private ChannelService channelService;

    private final Long entrepriseId = 42L;
    private final Long currentUserId = 100L;
    private final UUID channelId = UUID.randomUUID();
    private final CommunicationUserPrincipal currentUser =
            new CommunicationUserPrincipal(currentUserId, "john.doe", entrepriseId, List.of("ROLE_RH"), "token");

    private CommChannel testChannel;
    private CommChannelMember testMembership;

    @BeforeEach
    void setUp() {
        channelRepository = mock(CommChannelRepository.class);
        channelMemberRepository = mock(CommChannelMemberRepository.class);
        directChannelParticipantRepository = mock(CommDirectChannelParticipantRepository.class);
        messageRepository = mock(CommMessageRepository.class);
        reactionRepository = mock(CommReactionRepository.class);
        threadRepository = mock(CommThreadRepository.class);
        membershipService = mock(MembershipService.class);
        userDirectoryService = mock(UserDirectoryService.class);
        attachmentRepository = mock(CommAttachmentRepository.class);
        provisioningService = mock(CommunicationProvisioningService.class);
        mapper = mock(CommunicationMapper.class);
        auditService = mock(AuditService.class);

        channelService = new ChannelService(
                channelRepository,
                channelMemberRepository,
                directChannelParticipantRepository,
                messageRepository,
                reactionRepository,
                threadRepository,
                membershipService,
                userDirectoryService,
                attachmentRepository,
                provisioningService,
                mapper,
                auditService
        );

        testChannel = new CommChannel();
        testChannel.setId(channelId);
        testChannel.setEntrepriseId(entrepriseId);
        testChannel.setName("Ancien Nom");
        testChannel.setDescription("Ancienne description");
        testChannel.setType(ChannelType.STANDARD);
        testChannel.setArchived(false);
        testChannel.setCreatedAt(Instant.now());
        testChannel.setUpdatedAt(Instant.now());

        testMembership = new CommChannelMember();
        testMembership.setId(new CommChannelMemberId(channelId, currentUserId));
        testMembership.setChannel(testChannel);
        testMembership.setEntrepriseId(entrepriseId);
        testMembership.setRole(ChannelMemberRole.ADMIN);
        testMembership.setJoinedAt(Instant.now());

        when(membershipService.getChannelOrThrow(channelId, entrepriseId)).thenReturn(testChannel);
        when(membershipService.assertActiveMember(channelId, currentUser)).thenReturn(testMembership);
        when(membershipService.assertCanManage(channelId, currentUser)).thenReturn(testMembership);
        when(membershipService.getActiveMembers(channelId)).thenReturn(List.of(testMembership));
        when(channelRepository.save(any(CommChannel.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ChannelResponse mockResponse = ChannelResponse.builder()
                .id(channelId)
                .name("Ancien Nom")
                .isArchived(false)
                .build();
        when(mapper.toChannelResponse(any(), any(), any(), anyLong(), anyLong(), any(), any(), any(), anyLong()))
                .thenReturn(mockResponse);
    }

    @Test
    void updateChannel_shouldUpdateFieldsAndRecordAudit() {
        UpdateChannelRequest request = new UpdateChannelRequest("Nouveau Nom", "Nouvelle description");

        channelService.updateChannel(channelId, request, currentUser);

        assertThat(testChannel.getName()).isEqualTo("Nouveau Nom");
        assertThat(testChannel.getDescription()).isEqualTo("Nouvelle description");
        verify(channelRepository).save(testChannel);
        verify(auditService).record(eq(entrepriseId), eq(currentUserId), eq("CHANNEL"), eq(channelId.toString()), eq("channel.updated"), any());
    }

    @Test
    void updateChannel_shouldThrowWhenBothFieldsNull() {
        UpdateChannelRequest request = new UpdateChannelRequest(null, null);

        assertThatThrownBy(() -> channelService.updateChannel(channelId, request, currentUser))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("At least one field");
    }

    @Test
    void updateChannel_shouldThrowWhenChannelIsDirect() {
        testChannel.setType(ChannelType.DIRECT);
        UpdateChannelRequest request = new UpdateChannelRequest("Direct", "Desc");

        assertThatThrownBy(() -> channelService.updateChannel(channelId, request, currentUser))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("direct conversation");
    }

    @Test
    void archiveChannel_shouldSetArchivedTrueAndRecordAudit() {
        channelService.archiveChannel(channelId, currentUser);

        assertThat(testChannel.isArchived()).isTrue();
        assertThat(testChannel.getArchivedAt()).isNotNull();
        verify(channelRepository).save(testChannel);
        verify(auditService).record(eq(entrepriseId), eq(currentUserId), eq("CHANNEL"), eq(channelId.toString()), eq("channel.archived"), any());
    }

    @Test
    void archiveChannel_shouldThrowWhenAlreadyArchived() {
        testChannel.setArchived(true);

        assertThatThrownBy(() -> channelService.archiveChannel(channelId, currentUser))
                .isInstanceOf(CommunicationException.class)
                .satisfies(ex -> assertThat(((CommunicationException) ex).getStatus()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void archiveChannel_shouldThrowWhenDirectChannel() {
        testChannel.setType(ChannelType.DIRECT);

        assertThatThrownBy(() -> channelService.archiveChannel(channelId, currentUser))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("direct conversation");
    }

    @Test
    void addMembers_shouldAddNewMembersAndSave() {
        Long newUserId = 200L;
        AddChannelMembersRequest request = new AddChannelMembersRequest(List.of(newUserId));

        OrganisationUserSummary userSummary = mock(OrganisationUserSummary.class);
        when(userSummary.entrepriseId()).thenReturn(entrepriseId);
        when(userDirectoryService.getUserSummaries(currentUser, List.of(newUserId)))
                .thenReturn(Map.of(newUserId, userSummary));
        when(channelMemberRepository.findById(new CommChannelMemberId(channelId, newUserId)))
                .thenReturn(Optional.empty());

        channelService.addMembers(channelId, request, currentUser);

        verify(channelMemberRepository).save(argThat(m ->
                m.getId().getUserId().equals(newUserId) && m.getRole() == ChannelMemberRole.MEMBER
        ));
        verify(auditService).record(eq(entrepriseId), eq(currentUserId), eq("CHANNEL"), eq(channelId.toString()), eq("channel.members.added"), any());
    }

    @Test
    void addMembers_shouldReactivateMemberWhoLeft() {
        Long returningUserId = 200L;
        AddChannelMembersRequest request = new AddChannelMembersRequest(List.of(returningUserId));

        OrganisationUserSummary userSummary = mock(OrganisationUserSummary.class);
        when(userSummary.entrepriseId()).thenReturn(entrepriseId);
        when(userDirectoryService.getUserSummaries(currentUser, List.of(returningUserId)))
                .thenReturn(Map.of(returningUserId, userSummary));

        CommChannelMember returningMember = new CommChannelMember();
        returningMember.setId(new CommChannelMemberId(channelId, returningUserId));
        returningMember.setChannel(testChannel);
        returningMember.setEntrepriseId(entrepriseId);
        returningMember.setLeftAt(Instant.now().minusSeconds(3600));

        when(channelMemberRepository.findById(new CommChannelMemberId(channelId, returningUserId)))
                .thenReturn(Optional.of(returningMember));

        channelService.addMembers(channelId, request, currentUser);

        assertThat(returningMember.getLeftAt()).isNull();
        assertThat(returningMember.getRole()).isEqualTo(ChannelMemberRole.MEMBER);
        verify(channelMemberRepository).save(returningMember);
    }

    @Test
    void addMembers_shouldThrowWhenChannelArchived() {
        testChannel.setArchived(true);
        AddChannelMembersRequest request = new AddChannelMembersRequest(List.of(200L));

        assertThatThrownBy(() -> channelService.addMembers(channelId, request, currentUser))
                .isInstanceOf(CommunicationException.class)
                .satisfies(ex -> assertThat(((CommunicationException) ex).getStatus()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void removeMember_shouldSetLeftAtAndRecordAudit() {
        Long targetUserId = 200L;
        CommChannelMember targetMember = new CommChannelMember();
        targetMember.setId(new CommChannelMemberId(channelId, targetUserId));
        targetMember.setChannel(testChannel);
        targetMember.setEntrepriseId(entrepriseId);
        targetMember.setRole(ChannelMemberRole.MEMBER);

        when(membershipService.getMemberOrThrow(channelId, targetUserId, entrepriseId))
                .thenReturn(targetMember);

        channelService.removeMember(channelId, targetUserId, currentUser);

        assertThat(targetMember.getLeftAt()).isNotNull();
        verify(channelMemberRepository).save(targetMember);
        verify(auditService).record(eq(entrepriseId), eq(currentUserId), eq("CHANNEL"), eq(channelId.toString()), eq("channel.member.removed"), any());
    }

    @Test
    void removeMember_shouldThrowWhenRemovingOwner() {
        Long ownerUserId = 200L;
        CommChannelMember ownerMember = new CommChannelMember();
        ownerMember.setId(new CommChannelMemberId(channelId, ownerUserId));
        ownerMember.setChannel(testChannel);
        ownerMember.setRole(ChannelMemberRole.OWNER);

        when(membershipService.getMemberOrThrow(channelId, ownerUserId, entrepriseId))
                .thenReturn(ownerMember);

        assertThatThrownBy(() -> channelService.removeMember(channelId, ownerUserId, currentUser))
                .isInstanceOf(CommunicationException.class)
                .satisfies(ex -> assertThat(((CommunicationException) ex).getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void leaveChannel_shouldSetLeftAtForCurrentUser() {
        channelService.leaveChannel(channelId, currentUser);

        assertThat(testMembership.getLeftAt()).isNotNull();
        verify(channelMemberRepository).save(testMembership);
        verify(auditService).record(eq(entrepriseId), eq(currentUserId), eq("CHANNEL"), eq(channelId.toString()), eq("channel.member.left"), any());
    }

    @Test
    void leaveChannel_shouldThrowWhenUserIsOwner() {
        testMembership.setRole(ChannelMemberRole.OWNER);

        assertThatThrownBy(() -> channelService.leaveChannel(channelId, currentUser))
                .isInstanceOf(CommunicationException.class)
                .satisfies(ex -> assertThat(((CommunicationException) ex).getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void leaveChannel_shouldThrowWhenDirectChannel() {
        testChannel.setType(ChannelType.DIRECT);

        assertThatThrownBy(() -> channelService.leaveChannel(channelId, currentUser))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("direct conversation");
    }
}
