package com.weentime.communication.service;

import com.weentime.communication.dto.ChannelPermissionResponse;
import com.weentime.communication.entity.ChannelMemberRole;
import com.weentime.communication.entity.CommChannel;
import com.weentime.communication.entity.CommChannelMember;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.repository.CommChannelMemberRepository;
import com.weentime.communication.repository.CommChannelRepository;
import com.weentime.communication.security.CommunicationUserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MembershipService {

    private final CommChannelRepository channelRepository;
    private final CommChannelMemberRepository channelMemberRepository;

    public CommChannel getChannelOrThrow(UUID channelId, Long entrepriseId) {
        return channelRepository.findByIdAndEntrepriseId(channelId, entrepriseId)
                .orElseThrow(() -> new CommunicationException(HttpStatus.NOT_FOUND, "COMM_CHANNEL_NOT_FOUND",
                        "The requested conversation was not found.", Map.of("channelId", channelId)));
    }

    public CommChannelMember assertActiveMember(UUID channelId, CommunicationUserPrincipal currentUser) {
        return channelMemberRepository.findByChannel_IdAndEntrepriseIdAndId_UserIdAndLeftAtIsNull(
                        channelId, currentUser.entrepriseId(), currentUser.userId())
                .orElseThrow(() -> new CommunicationException(HttpStatus.FORBIDDEN, "COMM_CHANNEL_FORBIDDEN",
                        "You do not have access to this conversation.", Map.of("channelId", channelId)));
    }

    public void assertCanWrite(CommChannel channel, CommChannelMember member) {
        if (channel.isArchived()) {
            throw new CommunicationException(HttpStatus.CONFLICT, "COMM_CHANNEL_ARCHIVED",
                    "This conversation is archived.", Map.of("channelId", channel.getId()));
        }
        if (member.getRole() == ChannelMemberRole.READONLY) {
            throw new CommunicationException(HttpStatus.FORBIDDEN, "COMM_MESSAGE_WRITE_FORBIDDEN",
                    "You cannot send messages in this conversation.", Map.of("channelId", channel.getId()));
        }
    }

    public List<CommChannelMember> getActiveMembers(UUID channelId) {
        return channelMemberRepository.findByChannel_IdAndLeftAtIsNull(channelId);
    }

    public ChannelPermissionResponse permissionsFor(CommChannel channel, CommChannelMember member) {
        boolean canManage = member.getRole() == ChannelMemberRole.OWNER || member.getRole() == ChannelMemberRole.ADMIN;
        boolean canWrite = !channel.isArchived() && member.getRole() != ChannelMemberRole.READONLY;
        return ChannelPermissionResponse.builder()
                .canRead(true)
                .canWrite(canWrite)
                .canManage(canManage)
                .canUpload(canWrite)
                .build();
    }
}
