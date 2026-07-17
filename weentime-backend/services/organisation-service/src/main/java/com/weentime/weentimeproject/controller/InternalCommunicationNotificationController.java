package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.NotificationDispatchRequest;
import com.weentime.weentimeproject.service.InternalServiceKeyValidator;
import com.weentime.weentimeproject.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/organisations/internal/notifications")
@RequiredArgsConstructor
public class InternalCommunicationNotificationController {

    private final NotificationService notificationService;
    private final InternalServiceKeyValidator internalServiceKeyValidator;

    @PostMapping("/users/{userId}")
    public ResponseEntity<Void> sendToUser(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @PathVariable Long userId,
            @Valid @RequestBody NotificationDispatchRequest request) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        notificationService.sendToUser(userId, request);
        return ResponseEntity.accepted().build();
    }
}
