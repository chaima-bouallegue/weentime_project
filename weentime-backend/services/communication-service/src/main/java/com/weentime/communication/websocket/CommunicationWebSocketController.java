package com.weentime.communication.websocket;

import com.weentime.communication.dto.SendMessageRequest;
import com.weentime.communication.dto.TypingEventRequest;
import com.weentime.communication.dto.WebSocketErrorPayload;
import com.weentime.communication.dto.WebSocketEventResponse;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.security.SecurityUtils;
import com.weentime.communication.service.MessageService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Controller
@RequiredArgsConstructor
public class CommunicationWebSocketController {

    private final MessageService messageService;

    @MessageMapping("/communication/channels/{channelId}/messages")
    public void sendMessage(
            @DestinationVariable UUID channelId,
            SendMessageRequest request,
            Principal principal
    ) {
        messageService.sendMessage(channelId, request, SecurityUtils.fromPrincipal(principal));
    }

    @MessageMapping("/communication/channels/{channelId}/typing")
    public void typing(
            @DestinationVariable UUID channelId,
            TypingEventRequest request,
            Principal principal
    ) {
        messageService.publishTyping(channelId, SecurityUtils.fromPrincipal(principal), request.typing());
    }

    @MessageExceptionHandler(CommunicationException.class)
    @SendToUser("/queue/communication")
    public WebSocketEventResponse handleCommunicationException(CommunicationException exception) {
        return WebSocketEventResponse.builder()
                .eventId(UUID.randomUUID())
                .type("error")
                .entrepriseId(null)
                .channelId(null)
                .actorId(null)
                .data(WebSocketErrorPayload.builder()
                        .code(exception.getCode())
                        .message(exception.getMessage())
                        .details(exception.getDetails())
                        .build())
                .createdAt(Instant.now())
                .build();
    }

    @MessageExceptionHandler(Exception.class)
    @SendToUser("/queue/communication")
    public WebSocketEventResponse handleUnexpectedException(Exception exception) {
        return WebSocketEventResponse.builder()
                .eventId(UUID.randomUUID())
                .type("error")
                .entrepriseId(null)
                .channelId(null)
                .actorId(null)
                .data(WebSocketErrorPayload.builder()
                        .code("COMM_WEBSOCKET_ERROR")
                        .message("WebSocket request failed.")
                        .details(Map.of("reason", String.valueOf(exception.getMessage())))
                        .build())
                .createdAt(Instant.now())
                .build();
    }
}
