package com.weentime.communication.dto;

import lombok.Builder;

import java.util.List;
import java.util.UUID;

@Builder
public record EventReplayResponse(
        List<WebSocketEventResponse> events,
        boolean reloadRequired,
        String reloadReason,
        UUID lastEventId
) {
}
