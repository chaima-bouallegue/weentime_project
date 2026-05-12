package com.weentime.weentimeproject.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Slf4j
public class AuthTokenFilter extends OncePerRequestFilter {

    private final JwtUtils jwtUtils;

    public AuthTokenFilter(JwtUtils jwtUtils) {
        this.jwtUtils = jwtUtils;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        boolean shouldSkip = uri.startsWith("/api/v1/organisations/users/auth/")
                || uri.startsWith("/v3/api-docs")
                || uri.startsWith("/swagger-ui")
                || uri.equals("/swagger-ui.html");
        
        if (shouldSkip) {
            log.debug("Skipping JWT filter for URI: {}", uri);
        }
        return shouldSkip;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        try {
            String jwt = parseJwt(request);
            
            if (StringUtils.hasText(jwt)) {
                log.debug("JWT token found in request, validating...");
                
                if (jwtUtils.validateJwtToken(jwt)) {
                    String email = jwtUtils.getUserNameFromJwtToken(jwt);
                    List<String> roles = jwtUtils.getRolesFromJwtToken(jwt);

                    log.info("JWT validated successfully.");

                    List<SimpleGrantedAuthority> authorities = (roles != null && !roles.isEmpty())
                            ? roles.stream()
                                .map(SimpleGrantedAuthority::new)
                                .toList()
                            : List.of();

                    UsernamePasswordAuthenticationToken authentication =
                            new UsernamePasswordAuthenticationToken(email, null, authorities);

                    // Extract all claims to put in details (for easy access to entrepriseId/userId)
                    java.util.Map<String, Object> claims = new java.util.HashMap<>();
                    claims.put("entrepriseId", jwtUtils.getEntrepriseIdFromJwtToken(jwt));
                    claims.put("userId", jwtUtils.getUserIdFromJwtToken(jwt));
                    claims.put("roles", roles);
                    
                    authentication.setDetails(claims);
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                    
                    log.debug("Authentication context updated for user: {} with entrepriseId: {}", email, claims.get("entrepriseId"));
                } else {
                    log.warn("JWT token validation failed for request: {}", request.getRequestURI());
                }
            } else {
                log.debug("No JWT token found in request to: {}", request.getRequestURI());
            }
        } catch (Exception e) {
            log.error("Cannot set user authentication: {}", e.getMessage(), e);
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
