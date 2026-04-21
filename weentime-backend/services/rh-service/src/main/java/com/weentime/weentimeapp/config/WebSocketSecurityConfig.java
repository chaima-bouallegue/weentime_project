package com.weentime.weentimeapp.config;

/**
 * WebSocket message-level security is intentionally not configured here.
 *
 * Rationale: @EnableWebSocketSecurity (Spring Security 6) adds an
 * AuthorizationChannelInterceptor to the clientInboundChannel that runs
 * BEFORE our StompAuthInterceptor has a chance to set the authentication
 * principal from the JWT, causing SUBSCRIBE and SEND frames to be denied.
 *
 * Security is enforced at two levels instead:
 *   1. HTTP level: SecurityConfig permits /ws-rh/** for handshake only.
 *   2. STOMP level: StompAuthInterceptor validates the JWT Bearer token
 *      on every CONNECT frame and sets the SecurityContext for the session.
 */
public class WebSocketSecurityConfig {
    // Intentionally empty - see Javadoc above.
}
