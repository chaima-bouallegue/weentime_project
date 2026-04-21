package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.CreateRhRequest;
import com.weentime.weentimeproject.dto.response.CreateRhResponse;
import com.weentime.weentimeproject.dto.response.UserSummaryResponse;
import com.weentime.weentimeproject.service.UtilisateurService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collection;
import java.util.List;

@RestController
@RequestMapping("/api/v1/organisations/internal")
@RequiredArgsConstructor
public class InternalUtilisateurController {

    private final UtilisateurService utilisateurService;

    @PostMapping("/create-rh")
    public ResponseEntity<CreateRhResponse> createRhUser(@Valid @RequestBody CreateRhRequest request) {
        return new ResponseEntity<>(utilisateurService.createRhUser(request), HttpStatus.CREATED);
    }

    @GetMapping("/users/{id}/summary")
    public ResponseEntity<UserSummaryResponse> getUserSummary(@PathVariable Long id) {
        return ResponseEntity.ok(utilisateurService.getUserSummaryById(id));
    }

    @PostMapping("/users/summaries")
    public ResponseEntity<List<UserSummaryResponse>> getUserSummaries(@RequestBody Collection<Long> ids) {
        return ResponseEntity.ok(utilisateurService.getUserSummaries(ids));
    }

    @GetMapping("/users/{id}/manager")
    public ResponseEntity<UserSummaryResponse> getManagerSummary(@PathVariable Long id) {
        return ResponseEntity.ok(utilisateurService.getManagerSummary(id));
    }

    @GetMapping("/users/{id}/roles")
    public ResponseEntity<List<String>> getRoles(@PathVariable Long id) {
        return ResponseEntity.ok(utilisateurService.getRolesByUserId(id));
    }

    @GetMapping("/managers/{managerId}/team")
    public ResponseEntity<List<UserSummaryResponse>> getTeamMembers(@PathVariable Long managerId) {
        return ResponseEntity.ok(utilisateurService.getTeamMembers(managerId));
    }

    @GetMapping("/users/active")
    public ResponseEntity<List<UserSummaryResponse>> getActiveUsers() {
        return ResponseEntity.ok(utilisateurService.getActiveUsers());
    }
}
