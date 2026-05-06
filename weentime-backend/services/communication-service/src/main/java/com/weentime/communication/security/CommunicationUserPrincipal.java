package com.weentime.communication.security;

import java.security.Principal;
import java.util.List;

public record CommunicationUserPrincipal(
        Long userId,
        String username,
        Long entrepriseId,
        List<String> roles,
        String bearerToken
) implements Principal {
    @Override
    public String getName() {
        return username != null && !username.isBlank() ? username : String.valueOf(userId);
    }

    public String authorizationHeader() {
        return "Bearer " + bearerToken;
    }
}
