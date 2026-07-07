package com.weentime.weentimeapp.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class RefreshTokenService {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private static final String PREFIX = "jwt:refresh:";
    private static final long TTL_DAYS = 30;

    public String generate(String email, Long userId, Long entrepriseId, List<String> roles) {
        String token = UUID.randomUUID().toString();
        String key = PREFIX + token;
        try {
            String value = objectMapper.writeValueAsString(Map.of(
                    "email", email,
                    "userId", userId,
                    "entrepriseId", entrepriseId,
                    "roles", roles
            ));
            redisTemplate.opsForValue().set(key, value, TTL_DAYS, TimeUnit.DAYS);
            log.debug("Refresh token created for userId={}", userId);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize refresh token data", e);
        }
        return token;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> validate(String token) {
        String key = PREFIX + token;
        String value = redisTemplate.opsForValue().get(key);
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.readValue(value, Map.class);
        } catch (JsonProcessingException e) {
            log.error("Failed to deserialize refresh token data", e);
            return null;
        }
    }

    public void revoke(String token) {
        String key = PREFIX + token;
        redisTemplate.delete(key);
        log.debug("Refresh token revoked: {}", token);
    }
}
