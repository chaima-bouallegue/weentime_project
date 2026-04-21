package com.weentime.weentimeapp.security;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class StompAuthInterceptor implements ChannelInterceptor {

    private final JwtUtils jwtUtils;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
            MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {

            String authHeader = accessor.getFirstNativeHeader("Authorization");

            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                throw new MessagingException("Token manquant");
            }

            String token = authHeader.substring(7);

            if (!jwtUtils.validateToken(token)) {
                throw new MessagingException("Token invalide");
            }

            // Récupérer userId depuis le token
            Long userId = jwtUtils.getUserIdFromToken(token);
            String role = jwtUtils.getRoleFromToken(token);

            if (userId == null) {
                throw new MessagingException("Utilisateur non identifié dans le token");
            }

            // Attacher l'utilisateur à la session STOMP
            accessor.setUser(new StompPrincipal(userId.toString()));
            accessor.setSessionAttributes(Map.of(
                "userId", userId,
                "role", role != null ? role : "UNKNOWN"
            ));
        }
        return message;
    }
}
