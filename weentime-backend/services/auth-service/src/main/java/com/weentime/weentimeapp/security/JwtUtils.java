package com.weentime.weentimeapp.security;

import com.weentime.weentimeapp.security.services.UserDetailsImpl;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;
import java.util.List;

@Component
public class JwtUtils {
    private static final Logger logger = LoggerFactory.getLogger(JwtUtils.class);

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.expirationMs}")
    private int jwtExpirationMs;

    public String generateJwtToken(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof UserDetailsImpl userPrincipal)) {
            throw new IllegalArgumentException("Authentication principal is invalid");
        }

        return Jwts.builder()
                .setSubject(userPrincipal.getUsername())
                .claim("userId", userPrincipal.getId())
                .claim("role", userPrincipal.getAuthorities().stream()
                        .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                        .findFirst()
                        .orElse(null))
                .claim("entrepriseId", userPrincipal.getEntrepriseId())
                .claim("tokenPurpose", "ACCESS")
                .claim("twoFactorVerified", true)
                .claim("roles", userPrincipal.getAuthorities().stream()
                        .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                        .toList())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + jwtExpirationMs))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateToken(Long userId, String email, Long entrepriseId, List<String> roles) {
        return Jwts.builder()
                .setSubject(email)
                .claim("roles", roles)
                .claim("role", roles == null || roles.isEmpty() ? null : roles.get(0))
                .claim("userId", userId)
                .claim("entrepriseId", entrepriseId)
                .claim("tokenPurpose", "ACCESS")
                .claim("twoFactorVerified", true)
                .setIssuedAt(new Date())
                .setExpiration(new Date((new Date()).getTime() + jwtExpirationMs))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateTokenFor2FA(String email, String type) {
        return Jwts.builder()
                .setSubject(email)
                .claim("type", type)
                .claim("method", type)
                .claim("tokenPurpose", "2FA")
                .claim("twoFactorVerified", false)
                .setIssuedAt(new Date())
                .setExpiration(new Date((new Date()).getTime() + 300000)) // 5 minutes
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String getTypeFrom2faToken(String token) {
        Claims claims = getClaims(token);
        Object method = claims.get("method");
        return method != null ? String.valueOf(method) : String.valueOf(claims.get("type"));
    }

    public boolean isTwoFactorToken(String token) {
        return "2FA".equals(getTokenPurpose(token));
    }

    public boolean isAccessToken(String token) {
        Claims claims = getClaims(token);
        Object purpose = claims.get("tokenPurpose");
        boolean hasUserId = claims.get("userId") != null;
        if (purpose == null) {
            return hasUserId;
        }
        return "ACCESS".equals(String.valueOf(purpose))
                && hasUserId
                && isTruthy(claims.get("twoFactorVerified"));
    }

    public String getTokenPurpose(String token) {
        Object purpose = getClaims(token).get("tokenPurpose");
        return purpose == null ? null : String.valueOf(purpose);
    }

    private Key getSigningKey() {
        byte[] keyBytes = jwtSecret.getBytes();
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String getUserNameFromJwtToken(String token) {
        return getClaims(token).getSubject();
    }

    @SuppressWarnings("unchecked")
    public List<String> getRolesFromJwtToken(String token) {
        Claims claims = getClaims(token);
        return (List<String>) claims.get("roles");
    }

    public boolean validateJwtToken(String authToken) {
        try {
            Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(authToken);
            return true;
        } catch (MalformedJwtException e) {
            logger.error("Invalid JWT token: {}", e.getMessage());
        } catch (ExpiredJwtException e) {
            logger.error("JWT token is expired: {}", e.getMessage());
        } catch (UnsupportedJwtException e) {
            logger.error("JWT token is unsupported: {}", e.getMessage());
        } catch (IllegalArgumentException e) {
            logger.error("JWT claims string is empty: {}", e.getMessage());
        }
        return false;
    }

    private Claims getClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    private boolean isTruthy(Object value) {
        return Boolean.TRUE.equals(value) || "true".equalsIgnoreCase(String.valueOf(value));
    }
}
