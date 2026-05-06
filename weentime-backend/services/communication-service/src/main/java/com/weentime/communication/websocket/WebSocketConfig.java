package com.weentime.communication.websocket;

import com.weentime.communication.config.CommunicationProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final CommunicationChannelInterceptor communicationChannelInterceptor;
    private final CommunicationProperties communicationProperties;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws-communication")
                .setAllowedOriginPatterns("http://localhost:4200", "http://127.0.0.1:4200")
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
        if ("relay".equalsIgnoreCase(communicationProperties.getWebsocket().getBroker())) {
            registry.enableStompBrokerRelay("/topic", "/queue")
                    .setRelayHost(communicationProperties.getWebsocket().getRelay().getHost())
                    .setRelayPort(communicationProperties.getWebsocket().getRelay().getPort())
                    .setClientLogin(communicationProperties.getWebsocket().getRelay().getClientLogin())
                    .setClientPasscode(communicationProperties.getWebsocket().getRelay().getClientPasscode())
                    .setSystemLogin(communicationProperties.getWebsocket().getRelay().getSystemLogin())
                    .setSystemPasscode(communicationProperties.getWebsocket().getRelay().getSystemPasscode());
            return;
        }
        registry.enableSimpleBroker("/topic", "/queue");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(communicationChannelInterceptor);
    }
}
