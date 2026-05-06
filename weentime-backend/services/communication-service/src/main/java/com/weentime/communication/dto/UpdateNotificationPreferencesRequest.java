package com.weentime.communication.dto;

public record UpdateNotificationPreferencesRequest(
        Boolean directMessageEnabled,
        Boolean mentionEnabled,
        Boolean reactionEnabled,
        String channelNotificationMode
) {
}
