package com.weentime.weentimeproject.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.weentimeproject.service.EntrepriseAccessControlService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ModuleAccessInterceptor implements HandlerInterceptor {

    private final EntrepriseAccessControlService accessControlService;
    private final ObjectMapper objectMapper;

    // Mapping path-segment → ModuleKey
    private static final Map<String, String> PATH_TO_MODULE = Map.of(
            "presences", "PRESENCE",
            "conges", "CONGES",
            "paie", "PAIE",
            "recrutement", "RECRUTEMENT",
            "formation", "FORMATION");

    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler) throws Exception {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated())
            return true;

        // SUPER_ADMIN bypass
        boolean isSuperAdmin = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(a -> a.equals("ROLE_ADMIN") || a.equals("ROLE_SUPER_ADMIN"));
        if (isSuperAdmin)
            return true;

        String moduleKey = resolveModuleKey(request.getRequestURI());
        if (moduleKey == null)
            return true;

        // Extraire entrepriseId et role depuis le principal
        Long entrepriseId = extractEntrepriseId(auth);
        String role = extractHighestRole(auth);

        if (entrepriseId == null || role == null)
            return true;

        boolean enabled = accessControlService.isModuleEnabled(
                entrepriseId, role, moduleKey);

        if (!enabled) {
            log.warn("Module access denied — entreprise={} role={} module={} uri={}",
                    entrepriseId, role, moduleKey, request.getRequestURI());
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(objectMapper.writeValueAsString(Map.of(
                    "code", "MODULE_ACCESS_DENIED",
                    "message", "Ce module est désactivé pour votre entreprise.",
                    "module", moduleKey)));
            return false;
        }
        return true;
    }

    // ──────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────

    private String resolveModuleKey(String uri) {
        return PATH_TO_MODULE.entrySet().stream()
                .filter(e -> uri.contains("/" + e.getKey() + "/")
                        || uri.endsWith("/" + e.getKey()))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElse(null);
    }

    private Long extractEntrepriseId(Authentication auth) {
        try {
            // Adapter selon votre UserDetails — ex: ((UserDetailsImpl)
            // auth.getPrincipal()).getEntrepriseId()
            Object principal = auth.getPrincipal();
            if (principal instanceof com.weentime.weentimeproject.security.services.UserDetailsImpl ud) {
                return ud.getEntrepriseId();
            }
        } catch (Exception e) {
            log.debug("Impossible d'extraire entrepriseId du principal", e);
        }
        return null;
    }

    private String extractHighestRole(Authentication auth) {
        // Priorité : RH > MANAGER > EMPLOYE
        List<String> roles = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .toList();
        if (roles.contains("ROLE_RH"))
            return "ROLE_RH";
        if (roles.contains("ROLE_MANAGER"))
            return "ROLE_MANAGER";
        if (roles.contains("ROLE_EMPLOYE"))
            return "ROLE_EMPLOYE";
        return null;
    }
}