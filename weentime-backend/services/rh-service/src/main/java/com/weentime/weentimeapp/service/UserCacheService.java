package com.weentime.weentimeapp.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.weentime.weentimeapp.dto.UserResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.TimeUnit;

@Component
@Slf4j
public class UserCacheService {

    private final Cache<Long, UserResponse> cache = Caffeine.newBuilder()
            .maximumSize(5000)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();

    public UserResponse getOrLoad(Long userId, java.util.function.Function<Long, UserResponse> loader) {
        if (userId == null) {
            return null;
        }
        return cache.get(userId, loader);
    }

    public void seedAll(List<UserResponse> users) {
        if (users == null) return;
        for (UserResponse u : users) {
            if (u != null && u.getId() != null) {
                cache.put(u.getId(), u);
            }
        }
        log.debug("UserCacheService: {} utilisateurs pré-chargés en cache", users.size());
    }
}
