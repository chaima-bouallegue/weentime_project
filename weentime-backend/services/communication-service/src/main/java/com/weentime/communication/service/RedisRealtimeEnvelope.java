package com.weentime.communication.service;

import com.weentime.communication.dto.WebSocketEventResponse;

public record RedisRealtimeEnvelope(
        String scope,
        String target,
        WebSocketEventResponse event
) {
}
