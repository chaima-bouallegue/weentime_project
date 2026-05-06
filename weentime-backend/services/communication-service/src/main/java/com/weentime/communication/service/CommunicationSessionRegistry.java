package com.weentime.communication.service;

import com.weentime.communication.security.CommunicationAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class CommunicationSessionRegistry {

    private final Map<String, CommunicationAuthenticationToken> sessionAuthentications = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionToUserId = new ConcurrentHashMap<>();
    private final Map<String, String> sessionToPrincipalName = new ConcurrentHashMap<>();
    private final Map<Long, Set<String>> principalNamesByUserId = new ConcurrentHashMap<>();

    public void register(String sessionId, CommunicationAuthenticationToken authentication) {
        if (sessionId == null || authentication == null || authentication.getPrincipal() == null) {
            return;
        }
        sessionAuthentications.put(sessionId, authentication);
        register(sessionId, authentication.getPrincipal().userId(), authentication.getName());
    }

    public void register(String sessionId, Long userId, String principalName) {
        if (sessionId == null || userId == null || principalName == null || principalName.isBlank()) {
            return;
        }
        sessionToUserId.put(sessionId, userId);
        sessionToPrincipalName.put(sessionId, principalName);
        principalNamesByUserId.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet()).add(principalName);
    }

    public void unregister(String sessionId) {
        if (sessionId == null) {
            return;
        }

        sessionAuthentications.remove(sessionId);
        Long userId = sessionToUserId.remove(sessionId);
        String principalName = sessionToPrincipalName.remove(sessionId);
        if (userId == null || principalName == null) {
            return;
        }

        Set<String> principalNames = principalNamesByUserId.get(userId);
        if (principalNames == null) {
            return;
        }
        principalNames.remove(principalName);
        if (principalNames.isEmpty()) {
            principalNamesByUserId.remove(userId);
        }
    }

    public Set<String> getPrincipalNames(Long userId) {
        return userId == null
                ? Set.of()
                : Collections.unmodifiableSet(principalNamesByUserId.getOrDefault(userId, Set.of()));
    }

    public Optional<CommunicationAuthenticationToken> findAuthentication(String sessionId) {
        return Optional.ofNullable(sessionId == null ? null : sessionAuthentications.get(sessionId));
    }
}
