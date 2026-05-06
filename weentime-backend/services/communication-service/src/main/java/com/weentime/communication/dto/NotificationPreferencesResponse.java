package com.weentime.communication.dto;

import lombok.Builder;

@Builder
public record NotificationPreferencesResponse(
        boolean directMessageEnabled,
        boolean mentionEnabled,
        boolean reactionEnabled,
        String channelNotificationMode
) {
}
