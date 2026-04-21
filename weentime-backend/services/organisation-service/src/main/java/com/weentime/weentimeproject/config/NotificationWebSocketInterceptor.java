package com.weentime.weentimeproject.config;

import com.weentime.weentimeproject.security.JwtUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Component
@RequiredArgsConstructor
public class NotificationWebSocketInterceptor implements ChannelInterceptor {

    private final JwtUtils jwtUtils;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authorization = accessor.getFirstNativeHeader("Authorization");
            String token = extractBearerToken(authorization);
            if (token == null || !jwtUtils.validateJwtToken(token)) {
                throw new IllegalArgumentException("Connexion WebSocket non autorisee.");
            }

            String email = jwtUtils.getUserNameFromJwtToken(token);
            List<String> roles = jwtUtils.getRolesFromJwtToken(token);
            List<SimpleGrantedAuthority> authorities = roles == null
                    ? List.of()
                    : roles.stream().map(SimpleGrantedAuthority::new).toList();

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(email, token, authorities);

            Map<String, Object> details = new HashMap<>();
            details.put("userId", asLong(jwtUtils.getClaim(token, "userId")));
            details.put("entrepriseId", asLong(jwtUtils.getClaim(token, "entrepriseId")));
            authentication.setDetails(details);

            accessor.setUser(authentication);
            return message;
        }

        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            enforceUserTopicOwnership(accessor.getDestination(), accessor.getUser());
        }

        return message;
    }

    private void enforceUserTopicOwnership(String destination, Principal principal) {
        if (destination == null) {
            return;
        }
        String topicPrefix = destination.startsWith("/topic/notifications/")
                ? "/topic/notifications/"
                : destination.startsWith("/topic/user/")
                ? "/topic/user/"
                : null;
        if (topicPrefix == null) {
            return;
        }
        if (!(principal instanceof UsernamePasswordAuthenticationToken authentication)) {
            throw new IllegalArgumentException("Abonnement WebSocket non autorise.");
        }

        Object details = authentication.getDetails();
        if (!(details instanceof Map<?, ?> map)) {
            throw new IllegalArgumentException("Contexte WebSocket invalide.");
        }

        Long currentUserId = asLong(map.get("userId"));
        Long destinationUserId = asLong(destination.substring(topicPrefix.length()));
        if (!Objects.equals(currentUserId, destinationUserId)) {
            throw new IllegalArgumentException("Vous ne pouvez vous abonner qu'a vos propres notifications.");
        }
    }

    private String extractBearerToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return null;
        }
        return authorization.substring(7);
    }

    private Long asLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Long.parseLong(text);
        }
        return null;
    }
}
