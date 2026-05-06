package com.weentime.communication.service;

import com.weentime.communication.dto.WebSocketEventResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "communication.redis", name = "enabled", havingValue = "false", matchIfMissing = true)
public class LocalRealtimeEventPublisher implements RealtimeEventPublisher {

    private final LocalRealtimeDispatcher localRealtimeDispatcher;

    @Override
    public void publishChannelEvent(UUID channelId, WebSocketEventResponse event) {
        localRealtimeDispatcher.dispatchChannelEvent(channelId, event);
    }

    @Override
    public void publishUserEvent(Long userId, WebSocketEventResponse event) {
        localRealtimeDispatcher.dispatchUserEvent(userId, event);
    }
}
