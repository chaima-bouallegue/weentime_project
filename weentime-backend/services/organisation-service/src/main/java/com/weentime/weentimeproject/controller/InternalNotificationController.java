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
    public ResponseEntity<Void> sendToUser(
            @PathVariable Long userId,
            @Valid @RequestBody NotificationDispatchRequest request
    ) {
        notificationService.sendToUser(userId, request);
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/roles/{role}")
    public ResponseEntity<Void> sendToRole(
            @PathVariable String role,
            @Valid @RequestBody NotificationDispatchRequest request
    ) {
        notificationService.sendToRole(role, request);
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/managers/{managerId}")
    public ResponseEntity<Void> sendToManager(
            @PathVariable Long managerId,
            @Valid @RequestBody NotificationDispatchRequest request
    ) {
        notificationService.sendToManager(managerId, request);
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/rh")
    public ResponseEntity<Void> sendToRh(@Valid @RequestBody NotificationDispatchRequest request) {
        notificationService.sendToRH(request);
        return ResponseEntity.accepted().build();
    }
}
