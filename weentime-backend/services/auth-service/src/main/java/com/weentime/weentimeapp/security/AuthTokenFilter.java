package com.weentime.weentimeapp.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import com.weentime.weentimeapp.service.TokenBlacklistService;
import java.io.IOException;
import java.util.List;

public class AuthTokenFilter extends OncePerRequestFilter {

    private final JwtUtils jwtUtils;
    private final TokenBlacklistService tokenBlacklistService;

    private static final Logger LOGGER = LoggerFactory.getLogger(AuthTokenFilter.class);

    public AuthTokenFilter(JwtUtils jwtUtils, TokenBlacklistService tokenBlacklistService) {
        this.jwtUtils = jwtUtils;
        this.tokenBlacklistService = tokenBlacklistService;
    }
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {

        String uri = request.getRequestURI();
        LOGGER.info("JWT FILTER URI: {}", uri);

        return uri.equals("/api/v1/auth/login")
                || uri.equals("/api/v1/auth/register")
                || uri.equals("/api/v1/auth/mfa/verify")
                || uri.equals("/api/v1/auth/verify-2fa")
                || uri.equals("/api/v1/auth/2fa/verify")
                || uri.equals("/api/v1/auth/2fa/send")
                || uri.equals("/api/v1/auth/validate")
                || uri.equals("/api/v1/auth/refresh")
                || uri.equals("/api/v1/auth/logout")
                || "/health".equals(uri)
                || uri.startsWith("/v3/api-docs")
                || uri.startsWith("/swagger-ui");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {
        LOGGER.info("JWT Filter processing request: {}", request.getRequestURI());
        try {
            String jwt = parseJwt(request);

            if (jwt != null && jwtUtils.validateJwtToken(jwt) && jwtUtils.isAccessToken(jwt)) {

                String jti = jwtUtils.extractJti(jwt);
                if (jti != null && tokenBlacklistService.isBlacklisted(jti)) {
                    LOGGER.warn("JWT with jti {} is blacklisted", jti);
                    filterChain.doFilter(request, response);
                    return;
                }

                String email = jwtUtils.getUserNameFromJwtToken(jwt);
                List<String> roles = jwtUtils.getRolesFromJwtToken(jwt);
                if (roles == null) {
                    roles = List.of();
                }

                List<SimpleGrantedAuthority> authorities = roles.stream()
                        .map(SimpleGrantedAuthority::new)
                        .toList();

                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        email,
                        null,
                        authorities);

                authentication.setDetails(
                        new WebAuthenticationDetailsSource().buildDetails(request));

                SecurityContextHolder.getContext().setAuthentication(authentication);
            }

        } catch (Exception e) {
            LOGGER.error("Cannot set user authentication: {}", e.getMessage());
        }

        filterChain.doFilter(request, response);
    }

    private String parseJwt(HttpServletRequest request) {
        String headerAuth = request.getHeader("Authorization");

        if (StringUtils.hasText(headerAuth) && headerAuth.startsWith("Bearer ")) {
            return headerAuth.substring(7);
        }

        return null;
    }
}
