package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.response.PresenceResponse;
import com.weentime.weentimeproject.service.PresenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/presences")
@RequiredArgsConstructor
public class PresenceController {

    private final PresenceService presenceService;

    @PostMapping("/check-in")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PresenceResponse> checkIn() {
        return new ResponseEntity<>(presenceService.checkIn(), HttpStatus.CREATED);
    }

    @PostMapping("/check-out")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PresenceResponse> checkOut() {
        return ResponseEntity.ok(presenceService.checkOut());
    }

    @GetMapping("/me/today")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PresenceResponse> getToday() {
        return ResponseEntity.ok(presenceService.getToday());
    }

    @GetMapping("/me/history")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<PresenceResponse>> getHistory() {
        return ResponseEntity.ok(presenceService.getHistory());
    }
}
