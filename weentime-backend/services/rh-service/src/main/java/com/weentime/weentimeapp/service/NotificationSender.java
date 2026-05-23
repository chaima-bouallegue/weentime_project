package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.NotificationPayload;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationSender {

    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Envoyer à un utilisateur spécifique.
     * Utilise le userId comme identifiant de destination.
     */
    public void sendToUser(Long userId, NotificationPayload payload) {
        sendToUser(userId, (Object) payload);
    }

    public void sendToUser(Long userId, Object payload) {
        if (userId == null || payload == null) {
            log.warn("[WS] Tentative d'envoi à un userId null ou payload null");
            return;
        }
        try {
            messagingTemplate.convertAndSendToUser(
                userId.toString(),
                "/queue/notifications",
                payload
            );
            log.info("[WS] Notification envoyée à user {}", userId);
        } catch (Exception e) {
            log.error("[WS] Erreur envoi notification à user {}: {}", userId, e.getMessage());
        }
    }

    /**
     * Envoyer à tous les utilisateurs d'un rôle (ex: tous les RH).
     */
    public void sendToRole(String role, NotificationPayload payload) {
        sendToRole(role, (Object) payload);
    }

    public void sendToRole(String role, Object payload) {
        if (role == null || payload == null) return;
        try {
            messagingTemplate.convertAndSend("/topic/role/" + role.toLowerCase(), payload);
            log.info("[WS] Broadcast vers role {} : {}", role, payload);
        } catch (Exception e) {
            log.error("[WS] Erreur broadcast role {}: {}", role, e.getMessage());
        }
    }
}
