package com.weentime.weentimeapp.dto;

public record DocumentStatusChangedEvent(
        String type,
        Long documentId,
        String newStatus,
        String employeNom,
        String message
) {
    public static DocumentStatusChangedEvent of(Long documentId, String newStatus, String employeNom, String message) {
        return new DocumentStatusChangedEvent("DOCUMENT_STATUS_CHANGED", documentId, newStatus, employeNom, message);
    }
}
