package com.weentime.weentimeapp.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class JwtUtilsTest {

    private static final String SECRET = "defaultSecretKeyWithAtLeast256BitsForHMACSigningAndTestingPurpose!";
    private JwtUtils jwtUtils;

    @BeforeEach
    void setUp() {
        jwtUtils = new JwtUtils();
        ReflectionTestUtils.setField(jwtUtils, "jwtSecret", SECRET);
    }

    private String createToken(String subject, List<String> roles, Object entrepriseId, Object userId, long expirationMs) {
        var key = Keys.hmacShaKeyFor(SECRET.getBytes());
        var builder = Jwts.builder()
                .setSubject(subject)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key);

        if (roles != null) {
            builder.claim("roles", roles);
        }
        if (entrepriseId != null) {
            builder.claim("entrepriseId", entrepriseId);
        }
        if (userId != null) {
            builder.claim("userId", userId);
        }
        return builder.compact();
    }

    @Test
    void extractsSubjectAndRoles() {
        String token = createToken("test@weentime.com", List.of("ROLE_RH", "ROLE_USER"), 10L, 20L, 60000);

        assertThat(jwtUtils.getUserNameFromJwtToken(token)).isEqualTo("test@weentime.com");
        assertThat(jwtUtils.getRolesFromJwtToken(token)).containsExactly("ROLE_RH", "ROLE_USER");
        assertThat(jwtUtils.getRoleFromToken(token)).isEqualTo("ROLE_RH");
    }

    @Test
    void getRoleFromTokenReturnsNullWhenNoRoles() {
        String token = createToken("test@weentime.com", null, 10L, 20L, 60000);
        assertThat(jwtUtils.getRoleFromToken(token)).isNull();
    }

    @Test
    void extractsEntrepriseIdAndUserIdAsNumbers() {
        String token = createToken("user@test.com", List.of("ROLE_USER"), 15L, 35, 60000);

        assertThat(jwtUtils.getEntrepriseIdFromJwtToken(token)).isEqualTo(15L);
        assertThat(jwtUtils.getUserIdFromJwtToken(token)).isEqualTo(35L);
        assertThat(jwtUtils.getUserIdFromToken(token)).isEqualTo(35L);
    }

    @Test
    void returnsNullWhenEntrepriseIdOrUserIdNotNumber() {
        String token = createToken("user@test.com", List.of("ROLE_USER"), "not-a-number", "invalid-id", 60000);

        assertThat(jwtUtils.getEntrepriseIdFromJwtToken(token)).isNull();
        assertThat(jwtUtils.getUserIdFromJwtToken(token)).isNull();
    }

    @Test
    void returnsNullWhenEntrepriseIdOrUserIdMissing() {
        String token = createToken("user@test.com", List.of("ROLE_USER"), null, null, 60000);

        assertThat(jwtUtils.getEntrepriseIdFromJwtToken(token)).isNull();
        assertThat(jwtUtils.getUserIdFromJwtToken(token)).isNull();
    }

    @Test
    void validatesValidToken() {
        String token = createToken("user@test.com", List.of("ROLE_USER"), 1L, 2L, 60000);

        assertThat(jwtUtils.validateJwtToken(token)).isTrue();
        assertThat(jwtUtils.validateToken(token)).isTrue();
    }

    @Test
    void rejectsInvalidOrExpiredToken() {
        String expiredToken = createToken("user@test.com", List.of("ROLE_USER"), 1L, 2L, -60000);

        assertThat(jwtUtils.validateJwtToken(expiredToken)).isFalse();
        assertThat(jwtUtils.validateJwtToken("invalid-malformed-token")).isFalse();
        assertThat(jwtUtils.validateJwtToken(null)).isFalse();
    }
}
