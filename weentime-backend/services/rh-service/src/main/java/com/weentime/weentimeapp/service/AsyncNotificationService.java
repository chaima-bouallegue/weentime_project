package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.NotificationPayload;
import com.weentime.weentimeapp.entity.Notification;
import com.weentime.weentimeapp.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class AsyncNotificationService {

    private final NotificationSender notificationSender;
    private final NotificationRepository notificationRepository;
    private final OrganisationServiceClient organisationClient;

    // ─────────────────────────────────────────────────────────────────────────
    // Envoi à un utilisateur spécifique
    // ─────────────────────────────────────────────────────────────────────────

    @Async
    public void sendToUser(Long userId, NotificationPayload payload, Long entrepriseId) {
        // 1. Toujours persister en DB
        try {
            Notification notif = buildNotification(userId, null, payload, entrepriseId);
            notificationRepository.save(notif);
            log.info("[Notif] Persistée pour user {} — type={} (Entreprise {})", userId, payload.type(), entrepriseId);
        } catch (Exception e) {
            log.error("[Notif] Erreur persistance pour user {}: {}", userId, e.getMessage());
        }

        // 2. Pousser en temps réel via WebSocket (best effort)
        try {
            notificationSender.sendToUser(userId, payload);
        } catch (Exception e) {
            log.info("[Notif] User {} probablement hors ligne — notif persistée en DB", userId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Envoi broadcast à un rôle
    // ─────────────────────────────────────────────────────────────────────────

    @Async
    public void sendToRole(String role, NotificationPayload payload, Long entrepriseId) {
        // 1. Résoudre les utilisateurs du rôle et persister une notif par user
        List<Long> userIds = resolveUserIdsByRole(role, entrepriseId);
        for (Long uid : userIds) {
            try {
                Notification notif = buildNotification(uid, role, payload, entrepriseId);
                notificationRepository.save(notif);
            } catch (Exception e) {
                log.error("[Notif] Erreur persistance role {} pour user {}: {}", role, uid, e.getMessage());
            }
        }
        log.info("[Notif] Persistée pour {} users du rôle {} — type={}", userIds.size(), role, payload.type());

        // 2. Broadcast WebSocket (best effort)
        try {
            notificationSender.sendToRole(role, payload);
        } catch (Exception e) {
            log.info("[Notif] Broadcast rôle {} — notifs persistées en DB", role);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private Notification buildNotification(Long userId, String role,
                                           NotificationPayload payload, Long entrepriseId) {
        return Notification.builder()
                .destinataireId(userId)
                .destinataireRole(role)
                .type(payload.type())
                .titre(payload.titre())
                .message(payload.message())
                .icone(payload.icon())
                .couleur(payload.color())
                .route(payload.actionUrl())
                .entityId(payload.refId())
                .entityType(payload.refType())
                .lu(false)
                .dateCreation(LocalDateTime.now())
                .entrepriseId(entrepriseId)
                .build();
    }

    private List<Long> resolveUserIdsByRole(String role, Long entrepriseId) {
        if (entrepriseId == null) {
            log.warn("[Notif] entrepriseId null — impossible de résoudre les users du rôle {}", role);
            return Collections.emptyList();
        }
        try {
            return organisationClient.findUserIdsByEntrepriseAndRole(entrepriseId, role);
        } catch (Exception e) {
            log.error("[Notif] Erreur résolution rôle {} pour entreprise {}: {}", role, entrepriseId, e.getMessage());
            return Collections.emptyList();
        }
    }
}
