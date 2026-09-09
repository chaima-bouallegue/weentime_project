package com.weentime.communication.controller;

import com.weentime.communication.dto.*;
import com.weentime.communication.security.CommunicationUserPrincipal;
import com.weentime.communication.security.SecurityUtils;
import com.weentime.communication.service.ChannelService;
import com.weentime.communication.service.NotificationPreferencesService;
import com.weentime.communication.service.UnreadService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ChannelControllerTest {

    private ChannelService channelService;
    private UnreadService unreadService;
    private NotificationPreferencesService notificationPreferencesService;
    private ChannelController controller;
    private MockedStatic<SecurityUtils> securityUtilsMock;

    private final UUID channelId = UUID.randomUUID();
    private final CommunicationUserPrincipal currentUser =
            new CommunicationUserPrincipal(1L, "rh.user", 42L, List.of("ROLE_RH", "ROLE_ADMIN"), "mock-token");

    @BeforeEach
    void setUp() {
        channelService = mock(ChannelService.class);
        unreadService = mock(UnreadService.class);
        notificationPreferencesService = mock(NotificationPreferencesService.class);

        controller = new ChannelController(channelService, unreadService, notificationPreferencesService);

        securityUtilsMock = mockStatic(SecurityUtils.class);
        securityUtilsMock.when(SecurityUtils::currentUser).thenReturn(currentUser);
    }

    @AfterEach
    void tearDown() {
        securityUtilsMock.close();
    }

    @Test
    void updateChannel_shouldDelegateToServiceAndReturnSuccess() {
        UpdateChannelRequest request = new UpdateChannelRequest("Nouveau Nom", "Nouvelle description");
        ChannelResponse expectedResponse = ChannelResponse.builder()
                .id(channelId)
                .name("Nouveau Nom")
                .description("Nouvelle description")
                .build();

        when(channelService.updateChannel(eq(channelId), eq(request), eq(currentUser)))
                .thenReturn(expectedResponse);

        ApiEnvelope<ChannelResponse> response = controller.updateChannel(channelId, request);

        assertThat(response).isNotNull();
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isEqualTo(expectedResponse);
        verify(channelService).updateChannel(channelId, request, currentUser);
    }

    @Test
    void archiveChannel_shouldDelegateToServiceAndReturnSuccess() {
        ChannelResponse expectedResponse = ChannelResponse.builder()
                .id(channelId)
                .isArchived(true)
                .build();

        when(channelService.archiveChannel(eq(channelId), eq(currentUser)))
                .thenReturn(expectedResponse);

        ApiEnvelope<ChannelResponse> response = controller.archiveChannel(channelId);

        assertThat(response).isNotNull();
        assertThat(response.success()).isTrue();
        assertThat(response.data().isArchived()).isTrue();
        verify(channelService).archiveChannel(channelId, currentUser);
    }

    @Test
    void addMembers_shouldDelegateToServiceAndReturnSuccess() {
        AddChannelMembersRequest request = new AddChannelMembersRequest(List.of(2L, 3L));
        ChannelResponse expectedResponse = ChannelResponse.builder()
                .id(channelId)
                .memberCount(3)
                .build();

        when(channelService.addMembers(eq(channelId), eq(request), eq(currentUser)))
                .thenReturn(expectedResponse);

        ApiEnvelope<ChannelResponse> response = controller.addMembers(channelId, request);

        assertThat(response).isNotNull();
        assertThat(response.success()).isTrue();
        assertThat(response.data().memberCount()).isEqualTo(3);
        verify(channelService).addMembers(channelId, request, currentUser);
    }

    @Test
    void removeMember_shouldDelegateToServiceAndReturnSuccess() {
        Long targetUserId = 2L;
        ChannelResponse expectedResponse = ChannelResponse.builder()
                .id(channelId)
                .memberCount(1)
                .build();

        when(channelService.removeMember(eq(channelId), eq(targetUserId), eq(currentUser)))
                .thenReturn(expectedResponse);

        ApiEnvelope<ChannelResponse> response = controller.removeMember(channelId, targetUserId);

        assertThat(response).isNotNull();
        assertThat(response.success()).isTrue();
        assertThat(response.data().memberCount()).isEqualTo(1);
        verify(channelService).removeMember(channelId, targetUserId, currentUser);
    }

    @Test
    void leaveChannel_shouldDelegateToServiceAndReturnSuccess() {
        doNothing().when(channelService).leaveChannel(eq(channelId), eq(currentUser));

        ApiEnvelope<Void> response = controller.leaveChannel(channelId);

        assertThat(response).isNotNull();
        assertThat(response.success()).isTrue();
        verify(channelService).leaveChannel(channelId, currentUser);
    }
}
