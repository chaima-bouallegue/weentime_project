package com.weentime.gateway.security;

import lombok.RequiredArgsConstructor;
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

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        HttpMethod method = exchange.getRequest().getMethod();

        if (HttpMethod.OPTIONS.equals(method)
                || path.startsWith("/api/v1/auth/")
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
                || path.startsWith("/api/v1/organisations/by-code/")) {
            return chain.filter(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return unauthorized(exchange, "Missing Authorization header");
        }

        String token = authHeader.substring(7);

        if (!jwtUtils.validateJwtToken(token)) {
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
