package com.weentime.weentimeproject.service;

public interface AuditService {
    /**
     * Logs an audit action asynchronously.
     * 
     * @param action The action performed (e.g., CREATE_USER)
     * @param targetUser The identifier of the target user (usually email or ID)
     * @param details Additional details about the action
     * @param performedBy The user who performed the action (usually email or "SYSTEM")
     */
    void logAudit(String action, String targetUser, String details, String performedBy);
}
