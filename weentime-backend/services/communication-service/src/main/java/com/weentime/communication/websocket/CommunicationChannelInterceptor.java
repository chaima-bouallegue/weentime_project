package com.weentime.communication.websocket;

import com.weentime.communication.repository.CommChannelMemberRepository;
import com.weentime.communication.security.CommunicationAuthenticationToken;
import com.weentime.communication.security.CommunicationUserPrincipal;
import com.weentime.communication.security.JwtUtils;
import com.weentime.communication.service.CommunicationSessionRegistry;
import com.weentime.communication.service.RealtimeEventService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class CommunicationChannelInterceptor implements ChannelInterceptor {

    private final JwtUtils jwtUtils;
    private final CommChannelMemberRepository channelMemberRepository;
    private final CommunicationSessionRegistry sessionRegistry;
    private final ObjectProvider<RealtimeEventService> realtimeEventServiceProvider;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }

        StompCommand command = accessor.getCommand();
        if (command == StompCommand.CONNECT) {
            CommunicationAuthenticationToken authentication = authenticate(accessor);
            accessor.setUser(authentication);
            sessionRegistry.register(accessor.getSessionId(), authentication);
            SecurityContextHolder.getContext().setAuthentication(authentication);
            return message;
        }

        if (command == StompCommand.DISCONNECT) {
            sessionRegistry.unregister(accessor.getSessionId());
            return message;
        }

        if (command == StompCommand.SUBSCRIBE || command == StompCommand.SEND) {
            CommunicationAuthenticationToken authentication = resolveAuthentication(accessor);
            SecurityContextHolder.getContext().setAuthentication(authentication);
            validateDestination(accessor.getDestination(), authentication.getPrincipal());
        }

        return message;
    }

    @Override
    public void afterSendCompletion(Message<?> message, MessageChannel channel, boolean sent, Exception ex) {
        SecurityContextHolder.clearContext();
    }

    private CommunicationAuthenticationToken authenticate(StompHeaderAccessor accessor) {
        String authorization = accessor.getFirstNativeHeader("Authorization");
        if (!StringUtils.hasText(authorization) || !authorization.startsWith("Bearer ")) {
            throw new MessagingException("Missing Authorization header for websocket connect.");
        }
        String token = authorization.substring(7);
        if (!jwtUtils.validateJwtToken(token)) {
            throw new MessagingException("Invalid JWT token for websocket connect.");
        }
        Long userId = jwtUtils.getUserIdFromJwtToken(token);
        Long entrepriseId = jwtUtils.getEntrepriseIdFromJwtToken(token);
        if (userId == null || entrepriseId == null) {
            throw new MessagingException("JWT token is missing required websocket claims.");
        }
        CommunicationUserPrincipal principal = new CommunicationUserPrincipal(
                userId,
                jwtUtils.getUserNameFromJwtToken(token),
                entrepriseId,
                jwtUtils.getRolesFromJwtToken(token),
                token
        );
        return new CommunicationAuthenticationToken(
                principal,
                token,
                principal.roles().stream().map(SimpleGrantedAuthority::new).toList()
        );
    }

    private CommunicationAuthenticationToken resolveAuthentication(StompHeaderAccessor accessor) {
        if (accessor.getUser() instanceof CommunicationAuthenticationToken authentication) {
            return authentication;
        }
        CommunicationAuthenticationToken sessionAuthentication = sessionRegistry
                .findAuthentication(accessor.getSessionId())
                .orElse(null);
        if (sessionAuthentication != null) {
            accessor.setUser(sessionAuthentication);
            return sessionAuthentication;
        }
        return authenticate(accessor);
    }

    private void validateDestination(String destination, CommunicationUserPrincipal principal) {
        if (!StringUtils.hasText(destination)) {
            return;
        }

        if (destination.startsWith("/user/")) {
            validateUserDestination(destination, principal);
            return;
        }

        UUID channelId = extractChannelId(destination);
        if (channelId == null) {
            return;
        }

        boolean allowed = channelMemberRepository.existsByChannel_IdAndEntrepriseIdAndId_UserIdAndLeftAtIsNull(
                channelId, principal.entrepriseId(), principal.userId());
        if (!allowed) {
            realtimeEventServiceProvider.ifAvailable(realtimeEventService -> realtimeEventService.publishUserError(
                    principal.userId(),
                    "COMM_CHANNEL_FORBIDDEN",
                    "You do not have access to this conversation.",
                    java.util.Map.of("channelId", channelId)
            ));
            throw new MessagingException("Subscription denied for channel " + channelId);
        }
    }

    private void validateUserDestination(String destination, CommunicationUserPrincipal principal) {
        if ("/user/queue/communication".equals(destination)) {
            return;
        }
        realtimeEventServiceProvider.ifAvailable(realtimeEventService -> realtimeEventService.publishUserError(
                principal.userId(),
                "COMM_WEBSOCKET_DESTINATION_FORBIDDEN",
                "This user destination is not allowed.",
                java.util.Map.of("destination", destination)
        ));
        throw new MessagingException("Subscription denied for destination " + destination);
    }

    private UUID extractChannelId(String destination) {
        try {
            String topicPrefix = "/topic/communication/channel/";
            if (destination.startsWith(topicPrefix)) {
                return UUID.fromString(destination.substring(topicPrefix.length()));
            }

            String appPrefix = "/app/communication/channels/";
            if (destination.startsWith(appPrefix)) {
                return UUID.fromString(destination.substring(appPrefix.length()).split("/")[0]);
            }
            return null;
        } catch (Exception exception) {
            throw new MessagingException("Invalid channel destination: " + destination);
        }
    }
}
