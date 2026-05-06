package com.weentime.communication.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.List;
import java.util.Optional;

@Component
public class JwtUtils {

    private static final Logger logger = LoggerFactory.getLogger(JwtUtils.class);

    @Value("${jwt.secret}")
    private String jwtSecret;

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes());
    }

    public Claims parseClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    public boolean validateJwtToken(String authToken) {
        try {
            parseClaims(authToken);
            return true;
        } catch (Exception exception) {
            logger.error("JWT validation error: {}", exception.getMessage());
            return false;
        }
    }

    public String getUserNameFromJwtToken(String token) {
        return parseClaims(token).getSubject();
    }

    public Long getUserIdFromJwtToken(String token) {
        Object userId = parseClaims(token).get("userId");
        if (userId instanceof Number number) {
            return number.longValue();
        }
        if (userId instanceof String value) {
            try {
                return Long.parseLong(value);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    public Long getEntrepriseIdFromJwtToken(String token) {
        Object entrepriseId = parseClaims(token).get("entrepriseId");
        if (entrepriseId instanceof Number number) {
            return number.longValue();
        }
        if (entrepriseId instanceof String value) {
            try {
                return Long.parseLong(value);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    public List<String> getRolesFromJwtToken(String token) {
        return Optional.ofNullable((List<String>) parseClaims(token).get("roles")).orElse(List.of());
    }
}
