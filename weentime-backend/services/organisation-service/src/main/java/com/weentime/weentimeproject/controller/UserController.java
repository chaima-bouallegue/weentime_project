package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.ChangePasswordRequest;
import com.weentime.weentimeproject.dto.request.UserProfileUpdateRequest;
import com.weentime.weentimeproject.dto.response.ActivityItemResponse;
import com.weentime.weentimeproject.dto.response.UserProfileResponse;
import com.weentime.weentimeproject.dto.response.UtilisateurResponse;
import com.weentime.weentimeproject.service.AvatarStorageService;
import com.weentime.weentimeproject.service.UtilisateurService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UtilisateurService utilisateurService;
    private final AvatarStorageService avatarStorageService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RH')")
    public ResponseEntity<List<UtilisateurResponse>> getUsersByEntreprise(
            @RequestParam(required = false) Long entrepriseId) {
        if (entrepriseId == null) {
            return ResponseEntity.ok(List.of());
        }
        return ResponseEntity.ok(utilisateurService.getUtilisateursByEntreprise(entrepriseId));
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getCurrentUser() {
        return ResponseEntity.ok(utilisateurService.getCurrentUserProfile());
    }

    @PutMapping("/me")
    public ResponseEntity<UserProfileResponse> updateCurrentUser(@Valid @RequestBody UserProfileUpdateRequest request) {
        return ResponseEntity.ok(utilisateurService.updateCurrentUserProfile(request));
    }

    @PostMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> uploadAvatar(@RequestPart("avatar") MultipartFile avatar) {
        return ResponseEntity.ok(Map.of("avatarUrl", utilisateurService.updateCurrentUserAvatar(avatar)));
    }

    @GetMapping("/avatar/{filename:.+}")
    public ResponseEntity<Resource> getAvatar(@PathVariable String filename) {
        Resource resource = avatarStorageService.loadAvatar(filename);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }

    @PutMapping("/me/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        utilisateurService.changePassword(request);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/me/activity")
    public ResponseEntity<java.util.List<ActivityItemResponse>> getActivityHistory() {
        return ResponseEntity.ok(utilisateurService.getActivityHistory());
    }
}
