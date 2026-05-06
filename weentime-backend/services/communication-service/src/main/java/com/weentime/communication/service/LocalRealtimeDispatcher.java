package com.weentime.communication.service;

import com.weentime.communication.dto.WebSocketEventResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class LocalRealtimeDispatcher {

    private final SimpMessagingTemplate messagingTemplate;
    private final CommunicationSessionRegistry sessionRegistry;

    public void dispatchChannelEvent(UUID channelId, WebSocketEventResponse event) {
        messagingTemplate.convertAndSend("/topic/communication/channel/" + channelId, event);
    }

    public void dispatchUserEvent(Long userId, WebSocketEventResponse event) {
        for (String principalName : sessionRegistry.getPrincipalNames(userId)) {
            messagingTemplate.convertAndSendToUser(principalName, "/queue/communication", event);
        }
    }
}
