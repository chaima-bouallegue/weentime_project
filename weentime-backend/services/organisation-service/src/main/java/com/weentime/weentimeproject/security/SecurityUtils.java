package com.weentime.weentimeproject.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class SecurityUtils {

    public Long getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            return null;
        }

        Object principal = authentication.getPrincipal();
        if (principal instanceof Long userId) {
            return userId;
        }

        if (authentication.getDetails() instanceof Map<?, ?> map) {
            Object uid = map.get("userId");
            if (uid instanceof Number number) {
                return number.longValue();
            }
        }

        return null;
    }

    public Long getCurrentEntrepriseId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }

        Object details = authentication.getDetails();
        if (details instanceof Map<?, ?> map) {
            Object entrepriseId = map.get("entrepriseId");
            if (entrepriseId instanceof Number number) {
                return number.longValue();
            }
            if (entrepriseId instanceof String text) {
                try {
                    return Long.parseLong(text);
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return null;
    }
}
