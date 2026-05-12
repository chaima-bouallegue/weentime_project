package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.request.NotificationDispatchRequest;
import com.weentime.weentimeproject.dto.response.NotificationResponse;
import com.weentime.weentimeproject.enums.NotificationType;

import java.util.List;
import java.util.Map;

public interface NotificationService {
    NotificationResponse createNotification(Long userId, String title, String message, NotificationType type);
    NotificationResponse createNotification(
            Long userId,
            String title,
            String message,
            NotificationType type,
            String actionUrl,
            Map<String, Object> metadata
    );
    void notifyUser(Long userId, NotificationDispatchRequest payload);
    void notifyRole(String roleName, NotificationDispatchRequest payload);
    NotificationResponse markAsRead(Long notificationId);
    List<NotificationResponse> getUserNotifications(Long userId);
    long getUnreadCount(Long userId);

    default void sendToUser(Long userId, NotificationDispatchRequest request) {
        notifyUser(userId, request);
    }

    default void sendToRole(String role, NotificationDispatchRequest request) {
        notifyRole(role, request);
    }

    default void sendToManager(Long managerId, NotificationDispatchRequest request) {
        notifyUser(managerId, request);
    }

    default void sendToRH(NotificationDispatchRequest request) {
        notifyRole("ROLE_RH", request);
    }

    List<NotificationResponse> markAllAsRead();
    List<NotificationResponse> getUserNotifications();
    long getUnreadCount();
}
