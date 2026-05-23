package com.weentime.gateway.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.Key;

@Component
public class JwtUtils {

    @Value("${jwt.secret}")
    private String jwtSecret;

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes());
    }

    public boolean validateJwtToken(String authToken) {
        try {
            Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(authToken);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isAccessToken(String authToken) {
        try {
            Claims claims = Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(authToken).getBody();
            Object purpose = claims.get("tokenPurpose");
            Object userId = claims.get("userId");
            if (purpose == null) {
                return userId != null;
            }
            return "ACCESS".equals(String.valueOf(purpose))
                    && userId != null
                    && isTruthy(claims.get("twoFactorVerified"));
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isTruthy(Object value) {
        return Boolean.TRUE.equals(value) || "true".equalsIgnoreCase(String.valueOf(value));
    }
}
