package com.weentime.weentimeapp.security;

import com.weentime.weentimeapp.security.services.UserDetailsImpl;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.time.Duration;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Component
public class JwtUtils {
    private static final String CLAIM_USER_ID = "userId";
    private static final String CLAIM_ENTREPRISE_ID = "entrepriseId";
    private static final String CLAIM_ROLES = "roles";
    private static final String CLAIM_TOKEN_PURPOSE = "tokenPurpose";
    private static final String CLAIM_TWO_FACTOR_VERIFIED = "twoFactorVerified";

    private static final String PURPOSE_ACCESS = "ACCESS";
    private static final String PURPOSE_MFA_LOGIN = "MFA_LOGIN";

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
                .setId(UUID.randomUUID().toString())
                .setSubject(userPrincipal.getUsername())
                .claim(CLAIM_USER_ID, userPrincipal.getId())
                .claim("role", userPrincipal.getAuthorities().stream()
                        .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                        .findFirst()
                        .orElse(null))
                .claim(CLAIM_ENTREPRISE_ID, userPrincipal.getEntrepriseId())
                .claim(CLAIM_TOKEN_PURPOSE, PURPOSE_ACCESS)
                .claim(CLAIM_TWO_FACTOR_VERIFIED, true)
                .claim(CLAIM_ROLES, userPrincipal.getAuthorities().stream()
                        .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                        .toList())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + jwtExpirationMs))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateToken(Long userId, String email, Long entrepriseId, List<String> roles) {
        return Jwts.builder()
                .setId(UUID.randomUUID().toString())
                .setSubject(email)
                .claim(CLAIM_ROLES, roles)
                .claim("role", roles == null || roles.isEmpty() ? null : roles.get(0))
                .claim(CLAIM_USER_ID, userId)
                .claim(CLAIM_ENTREPRISE_ID, entrepriseId)
                .claim(CLAIM_TOKEN_PURPOSE, PURPOSE_ACCESS)
                .claim(CLAIM_TWO_FACTOR_VERIFIED, true)
                .setIssuedAt(new Date())
                .setExpiration(new Date((new Date()).getTime() + jwtExpirationMs))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateWsToken(UserDetailsImpl userDetails, Duration maxAge) {
        return Jwts.builder()
                .setId(UUID.randomUUID().toString())
                .setSubject(userDetails.getEmail())
                .claim(CLAIM_USER_ID, userDetails.getId())
                .claim("role", userDetails.getAuthorities().stream()
                        .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                        .findFirst().orElse(null))
                .claim(CLAIM_ENTREPRISE_ID, userDetails.getEntrepriseId())
                .claim(CLAIM_ROLES, userDetails.getAuthorities().stream()
                        .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                        .toList())
                .claim(CLAIM_TOKEN_PURPOSE, "WS")
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + maxAge.toMillis()))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateWsToken(Long userId, String email, Long entrepriseId, List<String> roles, Duration maxAge) {
        return Jwts.builder()
                .setId(UUID.randomUUID().toString())
                .setSubject(email)
                .claim(CLAIM_USER_ID, userId)
                .claim("role", roles == null || roles.isEmpty() ? null : roles.get(0))
                .claim(CLAIM_ENTREPRISE_ID, entrepriseId)
                .claim(CLAIM_ROLES, roles != null ? roles : List.of())
                .claim(CLAIM_TOKEN_PURPOSE, "WS")
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + maxAge.toMillis()))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public Long getUserIdFromJwtToken(String token) {
        Claims claims = getClaims(token);
        Object userId = claims.get(CLAIM_USER_ID);
        return userId == null ? null : Long.valueOf(userId.toString());
    }

    public Long getEntrepriseIdFromJwtToken(String token) {
        Claims claims = getClaims(token);
        Object entrepriseId = claims.get(CLAIM_ENTREPRISE_ID);
        return entrepriseId == null ? null : Long.valueOf(entrepriseId.toString());
    }

    public String generateTokenFor2FA(String email, String type) {
        return generateMfaLoginToken(email, type);
    }

    public String generateMfaLoginToken(String email, String type) {
        return Jwts.builder()
                .setSubject(email)
                .claim("type", type)
                .claim("method", type)
                .claim("purpose", PURPOSE_MFA_LOGIN)
                .claim(CLAIM_TOKEN_PURPOSE, PURPOSE_MFA_LOGIN)
                .claim(CLAIM_TWO_FACTOR_VERIFIED, false)
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
        String purpose = getTokenPurpose(token);
        return PURPOSE_MFA_LOGIN.equals(purpose) || "2FA".equals(purpose);
    }

    public boolean isMfaLoginToken(String token) {
        return PURPOSE_MFA_LOGIN.equals(getTokenPurpose(token));
    }

    public boolean isAccessToken(String token) {
        Claims claims = getClaims(token);
        Object purpose = claims.get(CLAIM_TOKEN_PURPOSE);
        boolean hasUserId = claims.get(CLAIM_USER_ID) != null;
        if (purpose == null) {
            return hasUserId;
        }
        return PURPOSE_ACCESS.equals(String.valueOf(purpose))
                && hasUserId
                && isTruthy(claims.get(CLAIM_TWO_FACTOR_VERIFIED));
    }

    public String getTokenPurpose(String token) {
        Object purpose = getClaims(token).get(CLAIM_TOKEN_PURPOSE);
        return purpose == null ? null : String.valueOf(purpose);
    }

    public String extractJti(String token) {
        try {
            return Jwts.parserBuilder()
                    .setSigningKey(getSigningKey())
                    .build()
                    .parseClaimsJws(token)
                    .getBody()
                    .getId();
        } catch (Exception e) {
            return null;
        }
    }

    public long getRemainingTtlSeconds(String token) {
        try {
            Date expiration = Jwts.parserBuilder()
                    .setSigningKey(getSigningKey())
                    .build()
                    .parseClaimsJws(token)
                    .getBody()
                    .getExpiration();
            long remaining = (expiration.getTime() - System.currentTimeMillis()) / 1000;
            return Math.max(0, remaining);
        } catch (Exception e) {
            return 0;
        }
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
        return (List<String>) claims.get(CLAIM_ROLES);
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
