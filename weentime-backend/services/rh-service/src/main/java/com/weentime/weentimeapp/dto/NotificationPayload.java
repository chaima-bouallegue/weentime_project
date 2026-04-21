package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.UUID;

public record NotificationPayload(
    String        id,          // UUID généré à la création
    String        type,        // voir enum ci-dessous
    String        titre,
    String        message,
    String        icon,        // "check-circle"|"clock"|"user-x"|"user-plus"|"alert"
    String        color,       // "green"|"red"|"amber"|"blue"|"purple"
    Long          refId,       // id de l'entité concernée (congé, pointage, user)
    String        refType,     // "CONGE"|"POINTAGE"|"UTILISATEUR"
    String        actionUrl,   // route Angular à ouvrir au clic
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    LocalDateTime timestamp,
    boolean       isRead       // false par défaut
) {
    public static NotificationPayload of(
            String type, String titre, String message,
            String icon, String color,
            Long refId, String refType, String actionUrl) {
        return new NotificationPayload(
            UUID.randomUUID().toString(),
            type, titre, message, icon, color,
            refId, refType, actionUrl,
            LocalDateTime.now(), false
        );
    }
}
