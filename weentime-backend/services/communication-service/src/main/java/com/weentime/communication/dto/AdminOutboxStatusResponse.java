package com.weentime.communication.dto;

import lombok.Builder;

import java.util.Map;

@Builder
public record AdminOutboxStatusResponse(
        long pending,
        long sent,
        long failed,
        long deadLetter,
        long notificationPending,
        long notificationDeadLetter,
        Map<String, Long> pendingByEventType
) {
}
