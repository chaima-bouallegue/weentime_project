package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record NotificationPayload(
    String        id,
    String        type,
    String        titre,
    String        message,
    String        icon,
    String        color,
    Long          refId,
    String        refType,
    String        actionUrl,
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    LocalDateTime timestamp,
    boolean       isRead,
    List<NotificationAction> actions
) {
    public static NotificationPayload of(
            String type, String titre, String message,
            String icon, String color,
            Long refId, String refType, String actionUrl) {
        return new NotificationPayload(
            UUID.randomUUID().toString(),
            type, titre, message, icon, color,
            refId, refType, actionUrl,
            LocalDateTime.now(), false, null
        );
    }

    public static NotificationPayload withActions(
            String type, String titre, String message,
            String icon, String color,
            Long refId, String refType, String actionUrl,
            List<NotificationAction> actions) {
        return new NotificationPayload(
            UUID.randomUUID().toString(),
            type, titre, message, icon, color,
            refId, refType, actionUrl,
            LocalDateTime.now(), false, actions
        );
    }

    public record NotificationAction(
        String label,
        String url,
        String method, // POST, PATCH
        String color,   // primary, accent, warn
        Object payload
    ) {}
}
