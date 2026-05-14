package com.weentime.communication.dto;

public final class NotificationEventTypes {

    public static final String NOTIFICATIONS_CREATED = "notifications.created";
    public static final String NOTIFICATIONS_READ = "notifications.read";

    public static final String LEAVE_REQUEST_SUBMITTED = "leave.request.submitted";
    public static final String LEAVE_REQUEST_APPROVED = "leave.request.approved";
    public static final String LEAVE_REQUEST_REJECTED = "leave.request.rejected";
    public static final String TELEWORK_REQUEST_UPDATED = "telework.request.updated";
    public static final String AUTHORIZATION_REQUEST_UPDATED = "authorization.request.updated";
    public static final String COMMUNICATION_MESSAGE_CREATED = "communication.message.created";
    public static final String COMMUNICATION_MENTION_CREATED = "communication.mention.created";

    private NotificationEventTypes() {
    }
}
