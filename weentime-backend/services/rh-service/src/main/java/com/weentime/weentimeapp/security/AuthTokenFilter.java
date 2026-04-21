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

import java.io.IOException;
import java.util.List;
import java.util.Map;

public class AuthTokenFilter extends OncePerRequestFilter {

    private final JwtUtils jwtUtils;
    public AuthTokenFilter(JwtUtils jwtUtils) {
        this.jwtUtils = jwtUtils;
    }

    private static final Logger log = LoggerFactory.getLogger(AuthTokenFilter.class);

    @Override
    protected void doFilterInternal(@org.springframework.lang.NonNull HttpServletRequest request, @org.springframework.lang.NonNull HttpServletResponse response, @org.springframework.lang.NonNull FilterChain filterChain)
            throws ServletException, IOException {
        try {
            log.debug(">>> [AuthTokenFilter] Processing request for URI: {}", request.getRequestURI());
            String jwt = parseJwt(request);
            log.info(">>> [AuthTokenFilter] URI={} | JWT present={}", request.getRequestURI(), jwt != null);
            if (jwt != null && jwtUtils.validateJwtToken(jwt)) {
                String username = jwtUtils.getUserNameFromJwtToken(jwt);
                List<String> roles = jwtUtils.getRolesFromJwtToken(jwt);
                Long entrepriseId = jwtUtils.getEntrepriseIdFromJwtToken(jwt);
                Long userId = jwtUtils.getUserIdFromJwtToken(jwt);
                log.info(">>> [AuthTokenFilter] JWT validated with {} role(s).", roles != null ? roles.size() : 0);

                List<SimpleGrantedAuthority> authorities = roles != null ? roles.stream()
                        .map(role -> {
                            String r = role.startsWith("ROLE_") ? role : "ROLE_" + role;
                            log.debug(">>> [AuthTokenFilter] Mapping role to authority {}", r);
                            return r;
                        })
                        .map(SimpleGrantedAuthority::new)
                        .toList() : List.of();

                log.info(">>> [AuthTokenFilter] Authorities set successfully.");


                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(username, null, authorities);

                // Store entrepriseId and userId in details for downstream use
                Map<String, Object> details = new java.util.HashMap<>();
                details.put("entrepriseId", entrepriseId);
                details.put("userId", userId);
                details.put("webDetails", new WebAuthenticationDetailsSource().buildDetails(request));
                authentication.setDetails(details);
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } else if (jwt != null) {
                log.warn(">>> [AuthTokenFilter] JWT validation FAILED for URI={}", request.getRequestURI());
            } else {
                log.debug(">>> [AuthTokenFilter] No JWT token found in request to URI={}", request.getRequestURI());
            }
        } catch (Exception e) {
            log.error("Cannot set user authentication: {}", e.getMessage());
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
