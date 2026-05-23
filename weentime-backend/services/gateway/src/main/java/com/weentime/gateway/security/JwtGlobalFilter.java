package com.weentime.gateway.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

@Component
@RequiredArgsConstructor
public class JwtGlobalFilter implements GlobalFilter, Ordered {

    private final JwtUtils jwtUtils;

    // Demo/public mode for the AI chatbot only. Defaults to false so production
    // behaviour is unchanged. Enable via env CHATBOT_PUBLIC_MODE=true (or the
    // chatbot.public-mode application property) to allow the AI chatbot
    // endpoints to be reached without an Authorization header. Backend
    // services and other AI routes remain JWT-protected.
    @Value("${chatbot.public-mode:${CHATBOT_PUBLIC_MODE:false}}")
    private boolean chatbotPublicMode;

    private boolean isPublicChatbotPath(String path) {
        if (!chatbotPublicMode || path == null) {
            return false;
        }
        return path.equals("/api/v1/ai/v2/chat")
                || path.equals("/api/v1/ai/v2/voice")
                || path.equals("/api/v1/ai/v2/chat/confirm")
                || path.startsWith("/api/v1/ai/chat/history/");
    }

    private boolean isPublicAuthPath(String path) {
        return path.equals("/api/v1/auth/login")
                || path.equals("/api/v1/auth/register")
                || path.equals("/api/v1/auth/verify-2fa")
                || path.equals("/api/v1/auth/2fa/verify")
                || path.equals("/api/v1/auth/2fa/send")
                || path.equals("/api/v1/auth/validate");
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        HttpMethod method = exchange.getRequest().getMethod();

        if (HttpMethod.OPTIONS.equals(method)
                || isPublicAuthPath(path)
                || path.startsWith("/v3/api-docs")
                || path.startsWith("/swagger-ui")
                || path.startsWith("/service/")
                || path.startsWith("/ws/")
                || path.startsWith("/ws-rh/")
                || path.startsWith("/ws-presence/")
                || path.startsWith("/ws-org/")
                || path.equals("/ws-communication")
                || path.startsWith("/ws-communication/")
                || path.startsWith("/api/v1/organisations/users/register")
                || path.startsWith("/api/v1/organisations/users/by-email")
                || path.startsWith("/api/v1/organisations/entreprises/validate-code/")
                || path.startsWith("/api/v1/organisations/by-code/")
                || isPublicChatbotPath(path)
                || path.startsWith("/api/v1/public/")) {
            return chain.filter(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return unauthorized(exchange, "Missing Authorization header");
        }

        String token = authHeader.substring(7);

        if (!jwtUtils.validateJwtToken(token) || !jwtUtils.isAccessToken(token)) {
            return unauthorized(exchange, "Invalid token");
        }

        return chain.filter(exchange);
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String message) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        String payload = """
                {"success":false,"data":null,"error":"UNAUTHORIZED","details":"%s","timestamp":"%s"}
                """.formatted(escapeJson(message), Instant.now());
        DataBuffer buffer = exchange.getResponse()
                .bufferFactory()
                .wrap(payload.getBytes(StandardCharsets.UTF_8));
        return exchange.getResponse().writeWith(Mono.just(buffer));
    }

    private String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    @Override
    public int getOrder() {
        return -1;
    }
}
