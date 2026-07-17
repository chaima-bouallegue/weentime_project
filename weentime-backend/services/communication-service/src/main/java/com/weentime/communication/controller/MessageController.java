package com.weentime.communication.controller;

import com.weentime.communication.dto.ApiEnvelope;
import com.weentime.communication.dto.CursorMessagePageResponse;
import com.weentime.communication.dto.MessageResponse;
import com.weentime.communication.dto.ReadMarkerResponse;
import com.weentime.communication.dto.SendMessageRequest;
import com.weentime.communication.dto.UpdateMessageRequest;
import com.weentime.communication.security.SecurityUtils;
import com.weentime.communication.service.MessageService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.UUID;

// Test commit: validating Docker Hub credentials fix in pipeline
@RestController
@RequestMapping("/api/v1/communication")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class MessageController {

    private final MessageService messageService;

    @GetMapping("/channels/{channelId}/messages")
    public ApiEnvelope<CursorMessagePageResponse> getMessages(
            @PathVariable UUID channelId,
            @RequestParam(defaultValue = "30") Integer limit,
            @RequestParam(required = false) String before
    ) {
        return ApiEnvelope.success(messageService.getMessages(channelId, limit, before, SecurityUtils.currentUser()));
    }

    @PostMapping("/channels/{channelId}/messages")
    public ApiEnvelope<MessageResponse> sendMessage(@PathVariable UUID channelId, @RequestBody SendMessageRequest request) {
        return ApiEnvelope.success(messageService.sendMessage(channelId, request, SecurityUtils.currentUser()));
    }

    @PutMapping("/messages/{messageId}")
    public ApiEnvelope<MessageResponse> updateMessage(
            @PathVariable UUID messageId,
            @RequestBody UpdateMessageRequest request
    ) {
        return ApiEnvelope.success(messageService.updateMessage(messageId, request, SecurityUtils.currentUser()));
    }

    @DeleteMapping("/messages/{messageId}")
    public ApiEnvelope<MessageResponse> deleteMessage(@PathVariable UUID messageId) {
        return ApiEnvelope.success(messageService.deleteMessage(messageId, SecurityUtils.currentUser()));
    }

    @PutMapping("/messages/{messageId}/reactions/{emoji}")
    public ApiEnvelope<MessageResponse> addReaction(@PathVariable UUID messageId, @PathVariable String emoji) {
        return ApiEnvelope.success(messageService.addReaction(messageId, emoji, SecurityUtils.currentUser()));
    }

    @DeleteMapping("/messages/{messageId}/reactions/{emoji}")
    public ApiEnvelope<MessageResponse> removeReaction(@PathVariable UUID messageId, @PathVariable String emoji) {
        return ApiEnvelope.success(messageService.removeReaction(messageId, emoji, SecurityUtils.currentUser()));
    }

    @PostMapping("/messages/{messageId}/read")
    public ApiEnvelope<ReadMarkerResponse> markRead(@PathVariable UUID messageId) {
        return ApiEnvelope.success(messageService.markRead(messageId, SecurityUtils.currentUser()));
    }

    @PutMapping("/messages/{messageId}/pin")
    public ApiEnvelope<MessageResponse> pinMessage(@PathVariable UUID messageId) {
        return ApiEnvelope.success(messageService.pinMessage(messageId, SecurityUtils.currentUser()));
    }

    @PutMapping("/messages/{messageId}/unpin")
    public ApiEnvelope<MessageResponse> unpinMessage(@PathVariable UUID messageId) {
        return ApiEnvelope.success(messageService.unpinMessage(messageId, SecurityUtils.currentUser()));
    }

    @GetMapping("/messages/{messageId}/replies")
    public ApiEnvelope<CursorMessagePageResponse> getThreadReplies(
            @PathVariable UUID messageId,
            @RequestParam(defaultValue = "50") Integer limit
    ) {
        return ApiEnvelope.success(messageService.getThreadReplies(messageId, limit, SecurityUtils.currentUser()));
    }
}
