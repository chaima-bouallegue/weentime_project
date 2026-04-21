package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.NotificationDispatchRequest;
import com.weentime.weentimeproject.dto.response.NotificationResponse;
import com.weentime.weentimeproject.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/notifications/internal")
@RequiredArgsConstructor
public class InternalNotificationController {

    private final NotificationService notificationService;

    @PostMapping("/users/{userId}")
    public ResponseEntity<NotificationResponse> sendToUser(
            @PathVariable Long userId,
            @Valid @RequestBody NotificationDispatchRequest request
    ) {
        return ResponseEntity.ok(notificationService.sendToUser(userId, request));
    }

    @PostMapping("/roles/{role}")
    public ResponseEntity<List<NotificationResponse>> sendToRole(
            @PathVariable String role,
            @Valid @RequestBody NotificationDispatchRequest request
    ) {
        return ResponseEntity.ok(notificationService.sendToRole(role, request));
    }

    @PostMapping("/managers/{managerId}")
    public ResponseEntity<NotificationResponse> sendToManager(
            @PathVariable Long managerId,
            @Valid @RequestBody NotificationDispatchRequest request
    ) {
        return ResponseEntity.ok(notificationService.sendToManager(managerId, request));
    }

    @PostMapping("/rh")
    public ResponseEntity<List<NotificationResponse>> sendToRh(@Valid @RequestBody NotificationDispatchRequest request) {
        return ResponseEntity.ok(notificationService.sendToRH(request));
    }
}
