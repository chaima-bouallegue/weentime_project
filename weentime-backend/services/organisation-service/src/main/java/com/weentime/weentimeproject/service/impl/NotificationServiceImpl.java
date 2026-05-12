package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.NotificationDispatchRequest;
import com.weentime.weentimeproject.dto.response.NotificationResponse;
import com.weentime.weentimeproject.entity.Notification;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.NotificationType;
import com.weentime.weentimeproject.enums.RoleNom;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import com.weentime.weentimeproject.repository.NotificationRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.NotificationService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class NotificationServiceImpl implements NotificationService {

    private final NotificationRepository notificationRepository;
    private final UtilisateurRepository utilisateurRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Override
    public NotificationResponse createNotification(Long userId, String title, String message, NotificationType type) {
        return createNotification(userId, title, message, type, null, Map.of());
    }

    @Override
    public NotificationResponse createNotification(
            Long userId,
            String title,
            String message,
            NotificationType type,
            String actionUrl,
            Map<String, Object> metadata
    ) {
        Utilisateur user = utilisateurRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("Utilisateur non trouve avec l'id : " + userId));

        Notification saved = notificationRepository.save(Notification.builder()
                .user(user)
                .title(title)
                .message(message)
                .type(type)
                .isRead(Boolean.FALSE)
                .actionUrl(actionUrl)
                .metadata(metadata == null || metadata.isEmpty() ? null : metadata)
                .build());

        NotificationResponse response = toResponse(saved);
        pushRealtime(response);
        return response;
    }

    @Async
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyUser(Long userId, NotificationDispatchRequest payload) {
        createNotification(
                userId,
                payload.getTitle(),
                payload.getMessage(),
                payload.getType(),
                payload.getActionUrl(),
                payload.getMetadata()
        );
    }

    @Async
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyRole(String roleName, NotificationDispatchRequest payload) {
        RoleNom role = RoleNom.valueOf(roleName);
        List<Utilisateur> users = payload.getEntrepriseId() == null
                ? utilisateurRepository.findByRoles_NomOrderByDateCreationDesc(role)
                : utilisateurRepository.findByEntreprise_IdAndRoles_NomOrderByDateCreationDesc(payload.getEntrepriseId(), role);

        users.stream()
                .filter(Objects::nonNull)
                .filter(user -> user.getStatut() == StatutUtilisateurEnum.ACTIF)
                .forEach(user -> notifyUser(user.getId(), payload));
    }

    @Override
    public NotificationResponse markAsRead(Long notificationId) {
        Long currentUserId = resolveCurrentUserId();
        Notification notification = notificationRepository.findByIdAndUser_Id(notificationId, currentUserId)
                .orElseThrow(() -> new EntityNotFoundException("Notification introuvable avec l'id : " + notificationId));

        if (Boolean.TRUE.equals(notification.getIsRead())) {
            return toResponse(notification);
        }

        notification.setIsRead(Boolean.TRUE);
        notification.setReadAt(LocalDateTime.now());
        return toResponse(notificationRepository.save(notification));
    }

    @Override
    public List<NotificationResponse> markAllAsRead() {
        Long currentUserId = resolveCurrentUserId();
        List<Notification> unread = notificationRepository.findByUser_IdAndIsReadFalse(currentUserId);
        LocalDateTime now = LocalDateTime.now();
        unread.forEach(notification -> {
            notification.setIsRead(Boolean.TRUE);
            notification.setReadAt(now);
        });
        return notificationRepository.saveAll(unread).stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<NotificationResponse> getUserNotifications() {
        return getUserNotifications(resolveCurrentUserId());
    }

    @Override
    @Transactional(readOnly = true)
    public List<NotificationResponse> getUserNotifications(Long userId) {
        return notificationRepository.findTop50ByUser_IdOrderByCreatedAtDesc(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public long getUnreadCount() {
        return getUnreadCount(resolveCurrentUserId());
    }

    @Override
    @Transactional(readOnly = true)
    public long getUnreadCount(Long userId) {
        return notificationRepository.countByUser_IdAndIsReadFalse(userId);
    }

    private Long resolveCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new IllegalStateException("Aucun utilisateur authentifie.");
        }

        String email = authentication.getName();
        return utilisateurRepository.findByEmail(email)
                .map(Utilisateur::getId)
                .orElseThrow(() -> new IllegalStateException("Utilisateur authentifie non trouve : " + email));
    }

    private void pushRealtime(NotificationResponse notification) {
        try {
            messagingTemplate.convertAndSend("/topic/notifications/" + notification.getUserId(), notification);
            messagingTemplate.convertAndSend("/topic/user/" + notification.getUserId(), notification);
        } catch (Exception exception) {
            log.warn("Unable to push realtime notification {}: {}", notification.getId(), exception.getMessage());
        }
    }

    private NotificationResponse toResponse(Notification notification) {
        return NotificationResponse.builder()
                .id(notification.getId())
                .userId(notification.getUser() != null ? notification.getUser().getId() : null)
                .title(notification.getTitle())
                .message(notification.getMessage())
                .type(notification.getType())
                .isRead(Boolean.TRUE.equals(notification.getIsRead()))
                .createdAt(notification.getCreatedAt())
                .readAt(notification.getReadAt())
                .actionUrl(notification.getActionUrl())
                .metadata(notification.getMetadata() == null ? Map.of() : notification.getMetadata())
                .build();
    }
}
