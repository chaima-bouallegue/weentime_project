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
        if (userId == null) {
            log.warn("[WS] Tentative d'envoi à un userId null. Type: {}", payload.type());
            return;
        }
        try {
            messagingTemplate.convertAndSendToUser(
                userId.toString(),
                "/queue/notifications",
                payload
            );
            log.info("[WS] Notification {} envoyée à user {}", payload.type(), userId);
        } catch (Exception e) {
            log.error("[WS] Erreur envoi mnotification à user {}: {}", userId, e.getMessage());
            // Ne pas faire planter le service métier si WS échoue
        }
    }

    /**
     * Envoyer à tous les utilisateurs d'un rôle (ex: tous les RH).
     */
    public void sendToRole(String role, NotificationPayload payload) {
        if (role == null) return;
        try {
            messagingTemplate.convertAndSend(
                "/topic/role/" + role.toLowerCase(),
                payload
            );
            log.info("[WS] Notification {} broadcast vers role {}", payload.type(), role);
        } catch (Exception e) {
            log.error("[WS] Erreur broadcast role {}: {}", role, e.getMessage());
        }
    }
}
