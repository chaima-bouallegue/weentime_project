package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.request.CreateRhRequest;
import com.weentime.weentimeproject.dto.request.StoreTwoFactorOtpRequest;
import com.weentime.weentimeproject.dto.request.VerifyTwoFactorOtpRequest;
import com.weentime.weentimeproject.dto.response.CreateRhResponse;
import com.weentime.weentimeproject.dto.response.OtpVerificationResponse;
import com.weentime.weentimeproject.dto.response.UserSummaryResponse;
import com.weentime.weentimeproject.service.InternalServiceKeyValidator;
import com.weentime.weentimeproject.service.TwoFactorOtpService;
import com.weentime.weentimeproject.service.UtilisateurService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collection;
import java.util.List;

@RestController
@RequestMapping("/api/v1/organisations/internal")
@RequiredArgsConstructor
public class InternalUtilisateurController {

    private final UtilisateurService utilisateurService;
    private final TwoFactorOtpService twoFactorOtpService;
    private final InternalServiceKeyValidator internalServiceKeyValidator;

    @PostMapping("/create-rh")
    public ResponseEntity<CreateRhResponse> createRhUser(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @Valid @RequestBody CreateRhRequest request) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return new ResponseEntity<>(utilisateurService.createRhUser(request), HttpStatus.CREATED);
    }

    @GetMapping("/users/{id}/summary")
    public ResponseEntity<UserSummaryResponse> getUserSummary(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @PathVariable Long id) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return ResponseEntity.ok(utilisateurService.getUserSummaryById(id));
    }

    @PostMapping("/users/summaries")
    public ResponseEntity<List<UserSummaryResponse>> getUserSummaries(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @RequestBody Collection<Long> ids) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return ResponseEntity.ok(utilisateurService.getUserSummaries(ids));
    }

    @GetMapping("/users/{id}/manager")
    public ResponseEntity<UserSummaryResponse> getManagerSummary(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @PathVariable Long id) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return ResponseEntity.ok(utilisateurService.getManagerSummary(id));
    }

    @GetMapping("/users/{id}/roles")
    public ResponseEntity<List<String>> getRoles(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @PathVariable Long id) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return ResponseEntity.ok(utilisateurService.getRolesByUserId(id));
    }

    @GetMapping("/managers/{managerId}/team")
    public ResponseEntity<List<UserSummaryResponse>> getTeamMembers(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @PathVariable Long managerId) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return ResponseEntity.ok(utilisateurService.getTeamMembers(managerId));
    }

    @GetMapping("/users/active")
    public ResponseEntity<List<UserSummaryResponse>> getActiveUsers(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return ResponseEntity.ok(utilisateurService.getActiveUsers());
    }

    @PostMapping("/users/2fa/update")
    public ResponseEntity<Void> update2faSettings(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @RequestParam String email,
            @RequestParam boolean enabled,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String secret) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        utilisateurService.update2faSettings(email, enabled, type, secret);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/users/2fa/backup-codes")
    public ResponseEntity<Void> updateBackupCodes(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @RequestParam String email,
            @RequestBody List<String> codes) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        utilisateurService.updateBackupCodes(email, codes);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/users/2fa/failure")
    public ResponseEntity<java.util.Map<String, Object>> register2faFailure(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @RequestParam String email) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return ResponseEntity.ok(utilisateurService.register2faFailure(email));
    }

    @PostMapping("/users/2fa/reset")
    public ResponseEntity<Void> reset2faAttempts(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @RequestParam String email) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        utilisateurService.reset2faAttempts(email);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/users/2fa/consume-backup-code")
    public ResponseEntity<Void> consumeBackupCode(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @RequestParam String email,
            @RequestParam String code) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        utilisateurService.consumeBackupCode(email, code);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/users/2fa/otp")
    public ResponseEntity<Void> storeOtp(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @Valid @RequestBody StoreTwoFactorOtpRequest request) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        twoFactorOtpService.storeOtp(request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @PostMapping("/users/2fa/otp/verify")
    public ResponseEntity<OtpVerificationResponse> verifyOtp(
            @RequestHeader("X-Internal-Service-Key") String internalServiceKey,
            @Valid @RequestBody VerifyTwoFactorOtpRequest request) {
        internalServiceKeyValidator.assertValid(internalServiceKey);
        return ResponseEntity.ok(twoFactorOtpService.verifyOtp(request));
    }
}
