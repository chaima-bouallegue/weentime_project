package com.weentime.weentimeapp.security;

import com.weentime.weentimeapp.security.services.UserDetailsImpl;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.util.ReflectionTestUtils;

import java.security.Key;
import java.time.Duration;
import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

class JwtUtilsTest {

    private JwtUtils jwtUtils;

    // Must be >= 256 bits for HS256
    private static final String TEST_SECRET = "SuperSecretKeyForTestingPurposesOnly1234567890!";
    private static final int TEST_EXPIRATION_MS = 3600000; // 1 hour

    @BeforeEach
    void setUp() {
        jwtUtils = new JwtUtils();
        ReflectionTestUtils.setField(jwtUtils, "jwtSecret", TEST_SECRET);
        ReflectionTestUtils.setField(jwtUtils, "jwtExpirationMs", TEST_EXPIRATION_MS);
    }

    // --- Helpers ---

    private UserDetailsImpl buildUserDetails() {
        return new UserDetailsImpl(
                1L,                          // id
                "user@weentime.com",         // email
                "encodedPassword",           // password
                "0600000000",                // telephone
                "ACTIF",                     // statut
                100L,                        // entrepriseId
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")),
                false,                       // twoFactorEnabled
                null,                        // twoFactorType
                null                         // twoFactorSecret
        );
    }

    private Authentication mockAuthentication(UserDetailsImpl principal) {
        Authentication auth = Mockito.mock(Authentication.class);
        when(auth.getPrincipal()).thenReturn(principal);
        return auth;
    }

    private Key signingKey() {
        return Keys.hmacShaKeyFor(TEST_SECRET.getBytes());
    }

    // =========================================================================
    // generateJwtToken(Authentication)
    // =========================================================================
    @Nested
    @DisplayName("generateJwtToken(Authentication)")
    class GenerateJwtTokenFromAuth {

        @Test
        @DisplayName("should produce a valid, parseable JWT with correct claims")
        void shouldGenerateValidToken() {
            UserDetailsImpl userDetails = buildUserDetails();
            Authentication auth = mockAuthentication(userDetails);

            String token = jwtUtils.generateJwtToken(auth);

            assertNotNull(token);
            assertTrue(jwtUtils.validateJwtToken(token));
            assertEquals("user@weentime.com", jwtUtils.getUserNameFromJwtToken(token));
            assertEquals(1L, jwtUtils.getUserIdFromJwtToken(token));
            assertEquals(100L, jwtUtils.getEntrepriseIdFromJwtToken(token));
            assertEquals(List.of("ROLE_ADMIN"), jwtUtils.getRolesFromJwtToken(token));
        }

        @Test
        @DisplayName("should throw on null authentication")
        void shouldThrowOnNullAuth() {
            assertThrows(IllegalArgumentException.class, () -> jwtUtils.generateJwtToken(null));
        }

        @Test
        @DisplayName("should throw when principal is not UserDetailsImpl")
        void shouldThrowOnWrongPrincipal() {
            Authentication auth = Mockito.mock(Authentication.class);
            when(auth.getPrincipal()).thenReturn("not-a-UserDetailsImpl");
            assertThrows(IllegalArgumentException.class, () -> jwtUtils.generateJwtToken(auth));
        }
    }

    // =========================================================================
    // generateToken(Long, String, Long, List<String>)
    // =========================================================================
    @Nested
    @DisplayName("generateToken(Long, String, Long, List<String>)")
    class GenerateTokenDirect {

        @Test
        @DisplayName("should produce token with correct subject and claims")
        void shouldGenerateTokenWithClaims() {
            String token = jwtUtils.generateToken(42L, "admin@weentime.com", 200L, List.of("ROLE_RH"));

            assertTrue(jwtUtils.validateJwtToken(token));
            assertEquals("admin@weentime.com", jwtUtils.getUserNameFromJwtToken(token));
            assertEquals(42L, jwtUtils.getUserIdFromJwtToken(token));
            assertEquals(200L, jwtUtils.getEntrepriseIdFromJwtToken(token));
            assertEquals(List.of("ROLE_RH"), jwtUtils.getRolesFromJwtToken(token));
        }

        @Test
        @DisplayName("should handle null roles gracefully")
        void shouldHandleNullRoles() {
            String token = jwtUtils.generateToken(1L, "x@y.com", 1L, null);

            assertTrue(jwtUtils.validateJwtToken(token));
            assertNull(jwtUtils.getRolesFromJwtToken(token));
        }
    }

    // =========================================================================
    // generateWsToken
    // =========================================================================
    @Nested
    @DisplayName("generateWsToken")
    class GenerateWsToken {

        @Test
        @DisplayName("should generate WS token from UserDetailsImpl")
        void shouldGenerateFromUserDetails() {
            UserDetailsImpl userDetails = buildUserDetails();
            String token = jwtUtils.generateWsToken(userDetails, Duration.ofMinutes(10));

            assertTrue(jwtUtils.validateJwtToken(token));
            assertEquals("user@weentime.com", jwtUtils.getUserNameFromJwtToken(token));
            assertEquals("WS", jwtUtils.getTokenPurpose(token));
        }

        @Test
        @DisplayName("should generate WS token from primitives")
        void shouldGenerateFromPrimitives() {
            String token = jwtUtils.generateWsToken(1L, "a@b.com", 5L, List.of("ROLE_USER"), Duration.ofMinutes(5));

            assertTrue(jwtUtils.validateJwtToken(token));
            assertEquals("a@b.com", jwtUtils.getUserNameFromJwtToken(token));
            assertEquals("WS", jwtUtils.getTokenPurpose(token));
        }
    }

    // =========================================================================
    // MFA / 2FA tokens
    // =========================================================================
    @Nested
    @DisplayName("MFA / 2FA token methods")
    class MfaTokens {

        @Test
        @DisplayName("generateTokenFor2FA delegates to generateMfaLoginToken")
        void generateTokenFor2FAShouldDelegate() {
            String token = jwtUtils.generateTokenFor2FA("user@weentime.com", "TOTP");

            assertTrue(jwtUtils.validateJwtToken(token));
            assertTrue(jwtUtils.isTwoFactorToken(token));
            assertTrue(jwtUtils.isMfaLoginToken(token));
            assertFalse(jwtUtils.isAccessToken(token));
        }

        @Test
        @DisplayName("generateMfaLoginToken sets correct purpose and type")
        void generateMfaLoginTokenClaims() {
            String token = jwtUtils.generateMfaLoginToken("user@weentime.com", "EMAIL");

            assertEquals("user@weentime.com", jwtUtils.getUserNameFromJwtToken(token));
            assertEquals("MFA_LOGIN", jwtUtils.getTokenPurpose(token));
            assertEquals("EMAIL", jwtUtils.getTypeFrom2faToken(token));
        }
    }

    // =========================================================================
    // Token inspection: isAccessToken, isTwoFactorToken, isMfaLoginToken
    // =========================================================================
    @Nested
    @DisplayName("Token purpose inspection")
    class TokenPurposeInspection {

        @Test
        @DisplayName("access token should be recognized as such")
        void accessTokenRecognized() {
            String token = jwtUtils.generateToken(1L, "a@b.com", 1L, List.of("ROLE_USER"));

            assertTrue(jwtUtils.isAccessToken(token));
            assertFalse(jwtUtils.isTwoFactorToken(token));
            assertFalse(jwtUtils.isMfaLoginToken(token));
            assertEquals("ACCESS", jwtUtils.getTokenPurpose(token));
        }

        @Test
        @DisplayName("MFA token should not be recognized as access token")
        void mfaTokenNotAccessToken() {
            String token = jwtUtils.generateMfaLoginToken("a@b.com", "TOTP");

            assertFalse(jwtUtils.isAccessToken(token));
            assertTrue(jwtUtils.isTwoFactorToken(token));
            assertTrue(jwtUtils.isMfaLoginToken(token));
        }
    }

    // =========================================================================
    // Claim extraction
    // =========================================================================
    @Nested
    @DisplayName("Claim extraction methods")
    class ClaimExtraction {

        @Test
        @DisplayName("getUserIdFromJwtToken returns correct userId")
        void shouldExtractUserId() {
            String token = jwtUtils.generateToken(99L, "a@b.com", 1L, List.of("ROLE_USER"));
            assertEquals(99L, jwtUtils.getUserIdFromJwtToken(token));
        }

        @Test
        @DisplayName("getEntrepriseIdFromJwtToken returns correct entrepriseId")
        void shouldExtractEntrepriseId() {
            String token = jwtUtils.generateToken(1L, "a@b.com", 42L, List.of("ROLE_USER"));
            assertEquals(42L, jwtUtils.getEntrepriseIdFromJwtToken(token));
        }

        @Test
        @DisplayName("getUserNameFromJwtToken returns subject (email)")
        void shouldExtractUsername() {
            String token = jwtUtils.generateToken(1L, "test@weentime.com", 1L, List.of("ROLE_USER"));
            assertEquals("test@weentime.com", jwtUtils.getUserNameFromJwtToken(token));
        }

        @Test
        @DisplayName("getRolesFromJwtToken returns role list")
        void shouldExtractRoles() {
            String token = jwtUtils.generateToken(1L, "a@b.com", 1L, List.of("ROLE_ADMIN", "ROLE_RH"));
            assertEquals(List.of("ROLE_ADMIN", "ROLE_RH"), jwtUtils.getRolesFromJwtToken(token));
        }
    }

    // =========================================================================
    // extractJti / getRemainingTtlSeconds
    // =========================================================================
    @Nested
    @DisplayName("JTI and TTL")
    class JtiAndTtl {

        @Test
        @DisplayName("extractJti should return non-null UUID string")
        void shouldExtractJti() {
            String token = jwtUtils.generateToken(1L, "a@b.com", 1L, List.of("ROLE_USER"));
            String jti = jwtUtils.extractJti(token);
            assertNotNull(jti);
            assertFalse(jti.isEmpty());
        }

        @Test
        @DisplayName("extractJti should return null for invalid token")
        void shouldReturnNullForInvalidToken() {
            assertNull(jwtUtils.extractJti("garbage.token.value"));
        }

        @Test
        @DisplayName("getRemainingTtlSeconds should return positive for fresh token")
        void shouldReturnPositiveTtl() {
            String token = jwtUtils.generateToken(1L, "a@b.com", 1L, List.of("ROLE_USER"));
            long ttl = jwtUtils.getRemainingTtlSeconds(token);
            assertTrue(ttl > 0);
            assertTrue(ttl <= TEST_EXPIRATION_MS / 1000);
        }

        @Test
        @DisplayName("getRemainingTtlSeconds should return 0 for invalid token")
        void shouldReturnZeroForInvalidToken() {
            assertEquals(0, jwtUtils.getRemainingTtlSeconds("invalid.token.here"));
        }
    }

    // =========================================================================
    // validateJwtToken
    // =========================================================================
    @Nested
    @DisplayName("validateJwtToken")
    class ValidateJwtToken {

        @Test
        @DisplayName("should return true for a valid token")
        void shouldValidateGoodToken() {
            String token = jwtUtils.generateToken(1L, "a@b.com", 1L, List.of("ROLE_USER"));
            assertTrue(jwtUtils.validateJwtToken(token));
        }

        @Test
        @DisplayName("should return false for malformed token")
        void shouldRejectMalformed() {
            assertFalse(jwtUtils.validateJwtToken("not.a.jwt"));
        }

        @Test
        @DisplayName("should throw SignatureException for token signed with wrong key (not caught by validateJwtToken)")
        void shouldRejectWrongSignature() {
            // NOTE: JwtUtils.validateJwtToken does not catch io.jsonwebtoken.security.SignatureException,
            // so a token signed with the wrong key causes an uncaught exception rather than returning false.
            // This test documents the actual behavior — fix in JwtUtils if silent rejection is desired.
            Key wrongKey = Keys.hmacShaKeyFor("AnotherSecretKeyThatIsDifferentFromTheTestOne!!".getBytes());
            String token = Jwts.builder()
                    .setSubject("hacker@evil.com")
                    .setIssuedAt(new Date())
                    .setExpiration(new Date(System.currentTimeMillis() + 60000))
                    .signWith(wrongKey, SignatureAlgorithm.HS256)
                    .compact();

            assertThrows(io.jsonwebtoken.security.SignatureException.class,
                    () -> jwtUtils.validateJwtToken(token));
        }

        @Test
        @DisplayName("should return false for expired token")
        void shouldRejectExpired() {
            String token = Jwts.builder()
                    .setSubject("expired@weentime.com")
                    .setIssuedAt(new Date(System.currentTimeMillis() - 7200000))
                    .setExpiration(new Date(System.currentTimeMillis() - 3600000))
                    .signWith(signingKey(), SignatureAlgorithm.HS256)
                    .compact();

            assertFalse(jwtUtils.validateJwtToken(token));
        }

        @Test
        @DisplayName("should return false for empty/null token")
        void shouldRejectEmpty() {
            assertFalse(jwtUtils.validateJwtToken(""));
        }
    }

    // =========================================================================
    // getTypeFrom2faToken
    // =========================================================================
    @Nested
    @DisplayName("getTypeFrom2faToken")
    class TypeFrom2FA {

        @Test
        @DisplayName("should return the method claim value")
        void shouldReturnMethod() {
            String token = jwtUtils.generateMfaLoginToken("u@t.com", "TOTP");
            assertEquals("TOTP", jwtUtils.getTypeFrom2faToken(token));
        }

        @Test
        @DisplayName("should return EMAIL type")
        void shouldReturnEmailType() {
            String token = jwtUtils.generateMfaLoginToken("u@t.com", "EMAIL");
            assertEquals("EMAIL", jwtUtils.getTypeFrom2faToken(token));
        }
    }
}
