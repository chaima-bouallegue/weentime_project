package com.weentime.communication.security;

import com.weentime.communication.exception.CommunicationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.security.Principal;
import java.util.Map;

public final class SecurityUtils {

    private SecurityUtils() {
    }

    public static CommunicationUserPrincipal currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof CommunicationUserPrincipal principal)) {
            throw new CommunicationException(HttpStatus.UNAUTHORIZED, "COMM_UNAUTHORIZED",
                    "Authentication is required.", Map.of());
        }
        return principal;
    }

    public static CommunicationUserPrincipal fromPrincipal(Principal principal) {
        if (principal instanceof CommunicationAuthenticationToken authenticationToken) {
            return authenticationToken.getPrincipal();
        }
        if (principal instanceof CommunicationUserPrincipal userPrincipal) {
            return userPrincipal;
        }
        throw new CommunicationException(HttpStatus.UNAUTHORIZED, "COMM_UNAUTHORIZED",
                "Authentication is required.", Map.of());
    }
}
