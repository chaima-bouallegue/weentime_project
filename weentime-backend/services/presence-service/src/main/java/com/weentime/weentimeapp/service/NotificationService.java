package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.NotificationClient;
import com.weentime.weentimeapp.dto.NotificationDispatchRequest;
import com.weentime.weentimeapp.dto.PresenceNotificationDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private final NotificationClient notificationClient;

    public void notifyUser(Long userId, PresenceNotificationDTO notification) {
        dispatch(() -> notificationClient.sendToUser(userId, toRequest(notification)));
    }

    public void notifyManager(Long managerId, PresenceNotificationDTO notification) {
        dispatch(() -> notificationClient.sendToManager(managerId, toRequest(notification)));
    }

    public void notifyHR(PresenceNotificationDTO notification) {
        dispatch(() -> notificationClient.sendToRh(toRequest(notification)));
    }

    private NotificationDispatchRequest toRequest(PresenceNotificationDTO notification) {
        return NotificationDispatchRequest.builder()
                .title(notification.getTitle())
                .message(notification.getMessage())
                .type("PRESENCE")
                .actionUrl(resolveActionUrl(notification))
                .entrepriseId(notification.getEntrepriseId())
                .metadata(buildMetadata(notification))
                .build();
    }

    private Map<String, Object> buildMetadata(PresenceNotificationDTO notification) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("audience", notification.getAudience());
        metadata.put("category", notification.getCategory());
        metadata.put("priority", notification.getPriority());
        metadata.put("managerId", notification.getManagerId());
        metadata.put("userId", notification.getUserId());
        metadata.put("entrepriseId", notification.getEntrepriseId());
        metadata.put("fullName", notification.getFullName());
        metadata.put("departement", notification.getDepartement());
        metadata.put("equipe", notification.getEquipe());
        metadata.put("impactedUsers", notification.getImpactedUsers());
        metadata.put("date", notification.getDate() != null ? notification.getDate().toString() : null);
        metadata.put("eventTime", notification.getEventTime() != null ? notification.getEventTime().toString() : null);
        metadata.put("status", notification.getStatus() != null ? notification.getStatus().name() : null);
        return metadata;
    }

    private String resolveActionUrl(PresenceNotificationDTO notification) {
        if ("EMPLOYEE".equalsIgnoreCase(notification.getAudience())) {
            return "/app/employee/presence";
        }
        if ("MANAGER".equalsIgnoreCase(notification.getAudience())) {
            return "/app/manager/dashboard";
        }
        return "/app/rh/dashboard";
    }

    private void dispatch(Runnable action) {
        try {
            action.run();
        } catch (Exception exception) {
            log.warn("Unable to dispatch persisted presence notification: {}", exception.getMessage());
        }
    }
}
