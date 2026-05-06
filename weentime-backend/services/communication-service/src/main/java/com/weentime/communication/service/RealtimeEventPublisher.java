package com.weentime.communication.service;

import com.weentime.communication.dto.WebSocketEventResponse;

import java.util.UUID;

public interface RealtimeEventPublisher {

    void publishChannelEvent(UUID channelId, WebSocketEventResponse event);

    void publishUserEvent(Long userId, WebSocketEventResponse event);
}
