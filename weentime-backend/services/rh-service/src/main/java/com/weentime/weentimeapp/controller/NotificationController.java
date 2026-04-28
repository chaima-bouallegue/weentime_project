package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.NotificationDTO;
import com.weentime.weentimeapp.dto.UtilisateurAuthResponse;
import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/rh/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;
    private final OrganisationServiceClient organisationServiceClient;

    private List<String> getCurrentUserRoles() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return List.of();
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList());
    }

    @GetMapping("/mes-notifications")
    public ResponseEntity<List<NotificationDTO>> getMesNotifications() {
        CurrentUserContext context = resolveCurrentUserContext();

        return ResponseEntity.ok(notificationService.getMesNotifications(context.userId(), context.entrepriseId(), context.roles()));
    }

    @GetMapping("/non-lues/count")
    public ResponseEntity<Long> getUnreadCount() {
        CurrentUserContext context = resolveCurrentUserContext();

        return ResponseEntity.ok(notificationService.countNonLues(context.userId(), context.entrepriseId()));
    }

    @PatchMapping("/{id}/lire")
    public ResponseEntity<Void> marquerCommeLue(@PathVariable Long id) {
        CurrentUserContext context = resolveCurrentUserContext();

        notificationService.marquerCommeLue(id, context.userId(), context.entrepriseId());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/tout-lire")
    public ResponseEntity<Void> toutMarquerCommeLu() {
        CurrentUserContext context = resolveCurrentUserContext();

        notificationService.toutMarquerCommeLu(context.userId(), context.entrepriseId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/tout-effacer")
    public ResponseEntity<Void> toutEffacer() {
        CurrentUserContext context = resolveCurrentUserContext();

        notificationService.toutEffacer(context.userId(), context.entrepriseId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/rh-context")
    public ResponseEntity<Map<String, Object>> getRhContext() {
        CurrentUserContext context = resolveCurrentUserContext();
        Map<String, Object> payload = new HashMap<>();
        payload.put("userId", context.userId());
        payload.put("entrepriseId", context.entrepriseId());
        payload.put("roles", context.roles());
        return ResponseEntity.ok(payload);
    }

    private CurrentUserContext resolveCurrentUserContext() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || auth.getName().isBlank()) {
            return new CurrentUserContext(null, null, List.of());
        }

        List<String> roles = getCurrentUserRoles();

        try {
            UtilisateurAuthResponse user = organisationServiceClient.getUtilisateurForAuth(auth.getName());
            if (user == null) {
                return new CurrentUserContext(null, null, roles);
            }

            return new CurrentUserContext(user.getId(), user.getEntrepriseId(), roles);
        } catch (Exception exception) {
            return new CurrentUserContext(null, null, roles);
        }
    }

    private record CurrentUserContext(Long userId, Long entrepriseId, List<String> roles) {
    }
}
