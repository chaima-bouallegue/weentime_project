package com.weentime.weentimeapp.client;

import com.weentime.weentimeapp.dto.RegisterRequest;
import com.weentime.weentimeapp.dto.StoreTwoFactorOtpRequest;
import com.weentime.weentimeapp.dto.UtilisateurAuthDTO;
import com.weentime.weentimeapp.dto.VerifyTwoFactorOtpRequest;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import com.weentime.weentimeapp.dto.ApiResponse;
import org.springframework.retry.annotation.Retryable;

@FeignClient(name = "organisation-service", url = "${application.config.organisation-service:http://localhost:8090}")
public interface OrganisationServiceClient {

    @CircuitBreaker(name = "organisationService", fallbackMethod = "fallbackGetUserByEmail")
    @Retryable(maxAttempts = 3)
    @GetMapping("/api/v1/organisations/users/auth/by-email")
    ResponseEntity<UtilisateurAuthDTO> getUserByEmail(@RequestParam("email") String email);

    @PostMapping("/api/v1/organisations/users/register")
    ResponseEntity<com.weentime.weentimeapp.dto.UtilisateurAuthDTO> registerUser(@RequestBody RegisterRequest request);

    @PostMapping("/api/v1/organisations/internal/users/2fa/update")
    ResponseEntity<Void> update2faSettings(@RequestParam("email") String email, 
                                           @RequestParam("enabled") boolean enabled,
                                           @RequestParam(value = "type", required = false) String type,
                                           @RequestParam(value = "secret", required = false) String secret);

    @PostMapping("/api/v1/organisations/internal/users/2fa/backup-codes")
    ResponseEntity<Void> updateBackupCodes(@RequestParam("email") String email,
                                            @RequestBody java.util.List<String> codes);

    @PostMapping("/api/v1/organisations/internal/users/2fa/failure")
    ResponseEntity<java.util.Map<String, Object>> register2faFailure(@RequestParam("email") String email);

    @PostMapping("/api/v1/organisations/internal/users/2fa/reset")
    ResponseEntity<Void> reset2faAttempts(@RequestParam("email") String email);

    @PostMapping("/api/v1/organisations/internal/users/2fa/consume-backup-code")
    ResponseEntity<Void> consumeBackupCode(@RequestParam("email") String email, @RequestParam("code") String code);

    @PostMapping("/api/v1/organisations/internal/users/2fa/otp")
    ResponseEntity<Void> storeTwoFactorOtp(@RequestBody StoreTwoFactorOtpRequest request);

    @PostMapping("/api/v1/organisations/internal/users/2fa/otp/verify")
    ResponseEntity<com.weentime.weentimeapp.dto.OtpVerificationResponse> verifyTwoFactorOtp(@RequestBody VerifyTwoFactorOtpRequest request);

    @PostMapping("/api/v1/organisations/internal/create-rh")
    ResponseEntity<com.weentime.weentimeapp.dto.CreateRhResponse> createRhUser(@RequestBody com.weentime.weentimeapp.dto.CreateRhRequest request);

    @GetMapping("/api/v1/organisations/rh")
    ResponseEntity<ApiResponse<java.util.List<com.weentime.weentimeapp.dto.RhOwnerResponse>>> getAllRh();

    @GetMapping("/api/v1/organisations/rh/entreprise/{entrepriseId}")
    ResponseEntity<ApiResponse<java.util.List<com.weentime.weentimeapp.dto.RhOwnerResponse>>> getRhByEntreprise(@org.springframework.web.bind.annotation.PathVariable("entrepriseId") Long entrepriseId);

    default ResponseEntity<UtilisateurAuthDTO> fallbackGetUserByEmail(String email, Throwable throwable) {
        org.slf4j.LoggerFactory.getLogger(OrganisationServiceClient.class)
                .error("Fallback getUserByEmail for {}: {}", email, throwable != null ? throwable.getMessage() : null);
        return ResponseEntity.status(503).build();
    }
}
