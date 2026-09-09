package com.weentime.communication.controller;

import com.weentime.communication.dto.AddChannelMembersRequest;
import com.weentime.communication.dto.ApiEnvelope;
import com.weentime.communication.dto.ChannelResponse;
import com.weentime.communication.dto.CreateChannelRequest;
import com.weentime.communication.dto.CreateWorkflowChannelRequest;
import com.weentime.communication.dto.MarkChannelReadRequest;
import com.weentime.communication.dto.NotificationPreferencesResponse;
import com.weentime.communication.dto.OpenDirectRequest;
import com.weentime.communication.dto.ReadMarkerResponse;
import com.weentime.communication.dto.UnreadSummaryResponse;
import com.weentime.communication.dto.UpdateChannelNotificationRequest;
import com.weentime.communication.dto.UpdateChannelRequest;
import com.weentime.communication.dto.UpdateNotificationPreferencesRequest;
import com.weentime.communication.security.SecurityUtils;
import com.weentime.communication.service.ChannelService;
import com.weentime.communication.service.NotificationPreferencesService;
import com.weentime.communication.service.UnreadService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;
import java.util.UUID;

// Test commit: validating Docker Hub credentials fix in pipeline
@RestController
@RequestMapping("/api/v1/communication")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ChannelController {

    private final ChannelService channelService;
    private final UnreadService unreadService;
    private final NotificationPreferencesService notificationPreferencesService;

    @GetMapping("/channels")
    public ApiEnvelope<List<ChannelResponse>> getChannels() {
        return ApiEnvelope.success(channelService.listChannels(SecurityUtils.currentUser()));
    }

    @GetMapping("/channels/{channelId}")
    public ApiEnvelope<ChannelResponse> getChannel(@PathVariable UUID channelId) {
        return ApiEnvelope.success(channelService.getChannel(channelId, SecurityUtils.currentUser()));
    }

    @PostMapping("/channels")
    public ApiEnvelope<ChannelResponse> createChannel(@Valid @RequestBody CreateChannelRequest request) {
        return ApiEnvelope.success(channelService.createChannel(request, SecurityUtils.currentUser()));
    }

    @PostMapping("/channels/workflow")
    public ApiEnvelope<ChannelResponse> createWorkflowChannel(@Valid @RequestBody CreateWorkflowChannelRequest request) {
        return ApiEnvelope.success(channelService.createWorkflowChannel(request, SecurityUtils.currentUser()));
    }

    @GetMapping("/channels/workflow/{demandeId}")
    public ApiEnvelope<ChannelResponse> getWorkflowChannel(@PathVariable String demandeId) {
        return ApiEnvelope.success(channelService.getWorkflowChannel(demandeId, SecurityUtils.currentUser()));
    }

    @PutMapping("/channels/{channelId}")
    public ApiEnvelope<ChannelResponse> updateChannel(
            @PathVariable UUID channelId,
            @Valid @RequestBody UpdateChannelRequest request
    ) {
        return ApiEnvelope.success(channelService.updateChannel(channelId, request, SecurityUtils.currentUser()));
    }

    @PutMapping("/channels/{channelId}/archive")
    public ApiEnvelope<ChannelResponse> archiveChannel(@PathVariable UUID channelId) {
        return ApiEnvelope.success(channelService.archiveChannel(channelId, SecurityUtils.currentUser()));
    }

    @PostMapping("/channels/{channelId}/members")
    public ApiEnvelope<ChannelResponse> addMembers(
            @PathVariable UUID channelId,
            @Valid @RequestBody AddChannelMembersRequest request
    ) {
        return ApiEnvelope.success(channelService.addMembers(channelId, request, SecurityUtils.currentUser()));
    }

    @DeleteMapping("/channels/{channelId}/members/{userId}")
    public ApiEnvelope<ChannelResponse> removeMember(
            @PathVariable UUID channelId,
            @PathVariable Long userId
    ) {
        return ApiEnvelope.success(channelService.removeMember(channelId, userId, SecurityUtils.currentUser()));
    }

    @PostMapping("/channels/{channelId}/leave")
    public ApiEnvelope<Void> leaveChannel(@PathVariable UUID channelId) {
        channelService.leaveChannel(channelId, SecurityUtils.currentUser());
        return ApiEnvelope.success(null);
    }

    @PostMapping("/direct")
    public ApiEnvelope<ChannelResponse> openDirect(@Valid @RequestBody OpenDirectRequest request) {
        return ApiEnvelope.success(channelService.openDirect(request, SecurityUtils.currentUser()));
    }

    @PostMapping("/channels/{channelId}/read")
    public ApiEnvelope<ReadMarkerResponse> markChannelRead(
            @PathVariable UUID channelId,
            @RequestBody(required = false) MarkChannelReadRequest request
    ) {
        return ApiEnvelope.success(unreadService.markChannelRead(channelId, request, SecurityUtils.currentUser()));
    }

    @GetMapping("/unread-summary")
    public ApiEnvelope<UnreadSummaryResponse> getUnreadSummary() {
        return ApiEnvelope.success(unreadService.getUnreadSummary(SecurityUtils.currentUser()));
    }

    @GetMapping("/preferences/notifications")
    public ApiEnvelope<NotificationPreferencesResponse> getNotificationPreferences() {
        return ApiEnvelope.success(notificationPreferencesService.getPreferences(SecurityUtils.currentUser()));
    }

    @PutMapping("/preferences/notifications")
    public ApiEnvelope<NotificationPreferencesResponse> updateNotificationPreferences(
            @RequestBody(required = false) UpdateNotificationPreferencesRequest request
    ) {
        return ApiEnvelope.success(notificationPreferencesService.updatePreferences(request, SecurityUtils.currentUser()));
    }

    @PutMapping("/channels/{channelId}/notification-level")
    public ApiEnvelope<Void> updateChannelNotificationLevel(
            @PathVariable UUID channelId,
            @RequestBody(required = false) UpdateChannelNotificationRequest request
    ) {
        notificationPreferencesService.updateChannelNotificationLevel(channelId, request, SecurityUtils.currentUser());
        return ApiEnvelope.success(null);
    }
}
