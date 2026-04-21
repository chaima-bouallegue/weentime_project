package com.weentime.weentimeapp.security;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class SecurityUtils {

    public static Long getCurrentUserId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) {
            throw new IllegalStateException("Authentication context not found");
        }
        // Read userId from details map (set by AuthTokenFilter)
        if (auth.getDetails() instanceof Map) {
            Map<?, ?> details = (Map<?, ?>) auth.getDetails();
            Object uid = details.get("userId");
            if (uid instanceof Number) return ((Number) uid).longValue();
        }
        throw new IllegalStateException("User ID not found in security context");
    }

    public static Long getCurrentEntrepriseId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getDetails() instanceof Map) {
            Map<?, ?> details = (Map<?, ?>) auth.getDetails();
            Object eid = details.get("entrepriseId");
            if (eid instanceof Number) return ((Number) eid).longValue();
        }
        throw new IllegalStateException("Entreprise ID not found in security context");
    }
}
