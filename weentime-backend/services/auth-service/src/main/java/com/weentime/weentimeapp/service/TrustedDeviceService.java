package com.weentime.weentimeapp.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class TrustedDeviceService {

    private static final String DEVICE_PREFIX = "auth:trusted_device:";
    private static final String USER_DEVICES_PREFIX = "auth:user_trusted_devices:";
    public static final String COOKIE_TRUSTED_DEVICE = "device_trust_token";
    public static final long DEFAULT_TRUST_DURATION_DAYS = 30;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrustedDeviceMetadata {
        private String email;
        private Long userId;
        private String ipAddress;
        private String userAgent;
        private Instant createdAt;
        private Instant lastUsedAt;
    }

    /**
     * Registers a new trusted device for a user.
     * Generates a high-entropy cryptographically random token, hashes it with SHA-256 for Redis storage,
     * and returns the raw token to be set in an HttpOnly cookie.
     */
    public String registerTrustedDevice(String email, Long userId, String ipAddress, String userAgent) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email cannot be null or empty");
        }

        byte[] randomBytes = new byte[32];
        secureRandom.nextBytes(randomBytes);
        String rawToken = UUID.randomUUID().toString() + "." + HexFormat.of().formatHex(randomBytes);

        String tokenHash = hashToken(rawToken);
        String deviceKey = DEVICE_PREFIX + tokenHash;
        String userKey = USER_DEVICES_PREFIX + email.trim().toLowerCase();

        Instant now = Instant.now();
        TrustedDeviceMetadata metadata = TrustedDeviceMetadata.builder()
                .email(email.trim().toLowerCase())
                .userId(userId)
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .createdAt(now)
                .lastUsedAt(now)
                .build();

        try {
            String json = objectMapper.writeValueAsString(metadata);
            redisTemplate.opsForValue().set(deviceKey, json, DEFAULT_TRUST_DURATION_DAYS, TimeUnit.DAYS);
            redisTemplate.opsForSet().add(userKey, tokenHash);
            redisTemplate.expire(userKey, DEFAULT_TRUST_DURATION_DAYS + 5, TimeUnit.DAYS);
            log.info("Trusted device registered successfully for user={} (valid {} days)", email, DEFAULT_TRUST_DURATION_DAYS);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize trusted device metadata for user={}", email, e);
            throw new IllegalStateException("Failed to register trusted device", e);
        }

        return rawToken;
    }

    /**
     * Checks if the given raw token is valid, active, and belongs to the given user email.
     */
    public boolean isDeviceTrusted(String email, String rawToken) {
        if (email == null || email.isBlank() || rawToken == null || rawToken.isBlank()) {
            return false;
        }

        String tokenHash = hashToken(rawToken);
        String deviceKey = DEVICE_PREFIX + tokenHash;

        String json = redisTemplate.opsForValue().get(deviceKey);
        if (json == null) {
            return false;
        }

        try {
            TrustedDeviceMetadata metadata = objectMapper.readValue(json, TrustedDeviceMetadata.class);
            if (metadata != null && email.trim().equalsIgnoreCase(metadata.getEmail())) {
                metadata.setLastUsedAt(Instant.now());
                redisTemplate.opsForValue().set(deviceKey, objectMapper.writeValueAsString(metadata), DEFAULT_TRUST_DURATION_DAYS, TimeUnit.DAYS);
                log.info("Trusted device verified successfully for user={}", email);
                return true;
            }
        } catch (JsonProcessingException e) {
            log.warn("Corrupted trusted device metadata for tokenHash={}", tokenHash, e);
            redisTemplate.delete(deviceKey);
        }

        return false;
    }

    /**
     * Revokes a specific device by its raw token.
     */
    public void revokeDevice(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        String tokenHash = hashToken(rawToken);
        String deviceKey = DEVICE_PREFIX + tokenHash;

        String json = redisTemplate.opsForValue().get(deviceKey);
        if (json != null) {
            try {
                TrustedDeviceMetadata metadata = objectMapper.readValue(json, TrustedDeviceMetadata.class);
                if (metadata != null && metadata.getEmail() != null) {
                    redisTemplate.opsForSet().remove(USER_DEVICES_PREFIX + metadata.getEmail().toLowerCase(), tokenHash);
                }
            } catch (JsonProcessingException ignored) {
            }
        }
        redisTemplate.delete(deviceKey);
        log.info("Trusted device revoked: hash={}", tokenHash);
    }

    /**
     * Revokes all trusted devices for a user.
     */
    public void revokeAllUserDevices(String email) {
        if (email == null || email.isBlank()) {
            return;
        }
        String userKey = USER_DEVICES_PREFIX + email.trim().toLowerCase();
        Set<String> tokenHashes = redisTemplate.opsForSet().members(userKey);
        if (tokenHashes != null && !tokenHashes.isEmpty()) {
            for (String hash : tokenHashes) {
                redisTemplate.delete(DEVICE_PREFIX + hash);
            }
        }
        redisTemplate.delete(userKey);
        log.info("All trusted devices revoked for user={}", email);
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.trim().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available", e);
        }
    }
}
