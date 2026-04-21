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
    NotificationResponse notifyUser(Long userId, NotificationDispatchRequest payload);
    List<NotificationResponse> notifyRole(String roleName, NotificationDispatchRequest payload);
    NotificationResponse markAsRead(Long notificationId);
    List<NotificationResponse> getUserNotifications(Long userId);
    long getUnreadCount(Long userId);

    default NotificationResponse sendToUser(Long userId, NotificationDispatchRequest request) {
        return notifyUser(userId, request);
    }

    default List<NotificationResponse> sendToRole(String role, NotificationDispatchRequest request) {
        return notifyRole(role, request);
    }

    default NotificationResponse sendToManager(Long managerId, NotificationDispatchRequest request) {
        return notifyUser(managerId, request);
    }

    default List<NotificationResponse> sendToRH(NotificationDispatchRequest request) {
        return notifyRole("ROLE_RH", request);
    }

    List<NotificationResponse> markAllAsRead();
    List<NotificationResponse> getUserNotifications();
    long getUnreadCount();
}
