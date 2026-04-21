package com.weentime.weentimeapp.client;

import com.weentime.weentimeapp.dto.NotificationDispatchRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "notification-service", url = "${integration.user-service.url}")
public interface NotificationClient {

    @PostMapping("/api/v1/notifications/internal/users/{userId}")
    void sendToUser(@PathVariable("userId") Long userId, @RequestBody NotificationDispatchRequest request);

    @PostMapping("/api/v1/notifications/internal/managers/{managerId}")
    void sendToManager(@PathVariable("managerId") Long managerId, @RequestBody NotificationDispatchRequest request);

    @PostMapping("/api/v1/notifications/internal/rh")
    void sendToRh(@RequestBody NotificationDispatchRequest request);
}
