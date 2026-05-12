package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.CreateRhRequest;
import com.weentime.weentimeapp.dto.CreateRhResponse;
import com.weentime.weentimeapp.dto.JwtResponse;
import com.weentime.weentimeapp.dto.LoginRequest;
import com.weentime.weentimeapp.dto.RegisterRequest;
import com.weentime.weentimeapp.dto.RegisterResponse;
import com.weentime.weentimeapp.dto.UtilisateurAuthDTO;
import com.weentime.weentimeapp.dto.Verify2faRequest;
import com.weentime.weentimeapp.security.JwtUtils;
import com.weentime.weentimeapp.security.services.EmailService;
import com.weentime.weentimeapp.security.services.TwoFactorService;
import com.weentime.weentimeapp.security.services.UserDetailsImpl;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtUtils jwtUtils;
    private final OrganisationServiceClient organisationServiceClient;
    private final TwoFactorService twoFactorService;
    private final EmailService emailService;

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<?>> authenticateUser(@Valid @RequestBody LoginRequest loginRequest) {
        log.info("LOGIN request received");

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            loginRequest.getEmail(),
                            loginRequest.getPassword()
                    ));
        } catch (AuthenticationException exception) {
            log.warn("Authentication failed: {}", exception.getClass().getSimpleName());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("AUTHENTICATION_FAILED", exception.getMessage()));
        }

        SecurityContextHolder.getContext().setAuthentication(authentication);

        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();

        if (userDetails.isTwoFactorEnabled()) {
            String tempToken;
            if ("EMAIL".equals(userDetails.getTwoFactorType())) {
                String code = twoFactorService.generateOtpCode();
                emailService.sendOtpCode(userDetails.getEmail(), code);
                twoFactorService.saveOtp(userDetails.getEmail(), code);
                tempToken = jwtUtils.generateTokenFor2FA(userDetails.getEmail(), "EMAIL");
            } else {
                tempToken = jwtUtils.generateTokenFor2FA(userDetails.getEmail(), "TOTP");
            }

            return ResponseEntity.ok(ApiResponse.success(
                    JwtResponse.builder()
                            .requires2FA(true)
                            .tempToken(tempToken)
                            .email(userDetails.getEmail())
                            .build(),
                    "2FA requis"
            ));
        }

        String jwt = jwtUtils.generateJwtToken(authentication);
        List<String> roles = new ArrayList<>(userDetails.getAuthorities().stream()
                .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                .toList());

        log.debug("Extracted {} authorities from authenticated principal", userDetails.getAuthorities().size());

        if (roles.isEmpty()) {
            log.warn("WARN - No roles found in authentication authorities. Attempting fallback fetch from organisation service.");
            try {
                ResponseEntity<UtilisateurAuthDTO> response = organisationServiceClient.getUserByEmail(userDetails.getEmail());
                if (response.getBody() != null && response.getBody().getRoles() != null) {
                    roles = new ArrayList<>(response.getBody().getRoles().stream()
                            .map(UtilisateurAuthDTO.RoleDTO::getNom)
                            .toList());
                    log.warn("WARN - Fallback successful - fetched {} roles", roles.size());
                } else {
                    log.error("ERROR - Fallback failed - organisation service returned empty roles");
                }
            } catch (Exception exception) {
                log.error("ERROR - Fallback fetch failed: {}", exception.getMessage(), exception);
            }
        }

        JwtResponse jwtResponse = new JwtResponse(jwt, userDetails.getId(), userDetails.getEmail(), userDetails.getEntrepriseId(), roles, false, null);
        log.info("LOGIN success for userId={}", userDetails.getId());
        return ResponseEntity.ok(ApiResponse.success(jwtResponse, "Authentification reussie"));
    }

    @PostMapping("/verify-2fa")
    public ResponseEntity<?> verify2fa(@Valid @RequestBody Verify2faRequest request) {
        if (!jwtUtils.validateJwtToken(request.getTempToken())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("INVALID_TEMP_TOKEN", "Token invalide ou expire"));
        }

        String email = jwtUtils.getUserNameFromJwtToken(request.getTempToken());
        String type = jwtUtils.getTypeFrom2faToken(request.getTempToken());

        UtilisateurAuthDTO dto = organisationServiceClient.getUserByEmail(email).getBody();
        if (dto == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("USER_NOT_FOUND", "Utilisateur non trouve"));
        }

        if (twoFactorService.isUserLocked(email)
                || (dto.getLockoutEnd() != null && dto.getLockoutEnd().isAfter(LocalDateTime.now()))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.failure("ACCOUNT_LOCKED", "Trop de tentatives. Compte bloque. Reessayez plus tard."));
        }

        boolean isValid;
        if ("TOTP".equals(type)) {
            String plainSecret = twoFactorService.decrypt(dto.getTwoFactorSecret());
            isValid = twoFactorService.verifyTotpCode(plainSecret, request.getCode());
        } else {
            isValid = twoFactorService.verifyStoredOtp(email, request.getCode());
        }

        if (isValid) {
            twoFactorService.resetAttempts(email);
            organisationServiceClient.reset2faAttempts(email);

            List<String> roles = extractRoles(dto);
            log.debug("2FA verification extracted {} roles", roles.size());

            String jwt = jwtUtils.generateToken(dto.getId(), email, dto.getEntrepriseId(), roles);
            JwtResponse response = new JwtResponse(jwt, dto.getId(), dto.getEmail(), dto.getEntrepriseId(), roles, false, null);
            log.info("2FA success for userId={}", dto.getId());
            return ResponseEntity.ok(ApiResponse.success(response, "2FA verifie avec succes"));
        }

        if (dto.getBackupCodes() != null) {
            for (String hashedBackup : dto.getBackupCodes()) {
                if (twoFactorService.verifyBackupCode(request.getCode(), hashedBackup)) {
                    organisationServiceClient.consumeBackupCode(email, hashedBackup);
                    twoFactorService.resetAttempts(email);
                    organisationServiceClient.reset2faAttempts(email);

                    List<String> roles = extractRoles(dto);
                    log.debug("2FA backup code accepted with {} roles", roles.size());

                    String jwt = jwtUtils.generateToken(dto.getId(), email, dto.getEntrepriseId(), roles);
                    JwtResponse response = new JwtResponse(jwt, dto.getId(), dto.getEmail(), dto.getEntrepriseId(), roles, false, null);
                    log.info("2FA backup code success for userId={}", dto.getId());
                    return ResponseEntity.ok(ApiResponse.success(response, "Code de secours accepte"));
                }
            }
        }

        long attempts = twoFactorService.incrementAttempts(email);
        if (attempts >= 5) {
            twoFactorService.lockUser(email);
            organisationServiceClient.register2faFailure(email);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.failure("TOO_MANY_ATTEMPTS", "Code incorrect. Trop de tentatives, compte bloque pour 10 minutes."));
        }

        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure("INVALID_2FA_CODE", "Code incorrect"));
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<?> setup2fa(Authentication authentication, @RequestParam String type) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }

        if ("AUTHENTICATOR".equals(type)) {
            String secret = twoFactorService.generateTotpSecret();
            return ResponseEntity.ok(ApiResponse.success(
                    Map.of(
                            "secret", secret,
                            "qrCodeUrl", "otpauth://totp/Weentime:" + email + "?secret=" + secret + "&issuer=Weentime"
                    ),
                    "Configuration AUTHENTICATOR generee"
            ));
        }

        if ("EMAIL".equals(type)) {
            String code = twoFactorService.generateOtpCode();
            emailService.sendOtpCode(email, code);
            twoFactorService.saveOtp(email, code);
            String setupToken = jwtUtils.generateTokenFor2FA(email, "EMAIL");
            return ResponseEntity.ok(ApiResponse.success(Map.of("setupToken", setupToken), "Code OTP envoye par email"));
        }

        return ResponseEntity.badRequest()
                .body(ApiResponse.failure("INVALID_2FA_TYPE", "Type 2FA invalide"));
    }

    @PostMapping("/2fa/confirm")
    public ResponseEntity<?> confirm2fa(Authentication authentication, @RequestBody Map<String, String> request) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }

        String type = request.get("type");
        String code = request.get("code");

        boolean isValid = false;
        String secretToSave = null;

        if ("AUTHENTICATOR".equals(type)) {
            String secret = request.get("secret");
            isValid = twoFactorService.verifyTotpCode(secret, code);
            secretToSave = twoFactorService.encrypt(secret);
        } else if ("EMAIL".equals(type)) {
            String setupToken = request.get("setupToken");
            if (jwtUtils.validateJwtToken(setupToken)) {
                isValid = twoFactorService.verifyStoredOtp(email, code);
            }
        }

        if (isValid) {
            organisationServiceClient.update2faSettings(email, true, type, secretToSave);

            List<String> backupCodes = new ArrayList<>();
            List<String> hashedBackupCodes = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                String backupCode = twoFactorService.generateOtpCode();
                backupCodes.add(backupCode);
                hashedBackupCodes.add(twoFactorService.hashBackupCode(backupCode));
            }
            organisationServiceClient.updateBackupCodes(email, hashedBackupCodes);

            return ResponseEntity.ok(ApiResponse.success(Map.of("backupCodes", backupCodes), "2FA active avec succes"));
        }

        return ResponseEntity.badRequest()
                .body(ApiResponse.failure("INVALID_CONFIRMATION_CODE", "Code de confirmation invalide"));
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<?> disable2fa(Authentication authentication) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }
        organisationServiceClient.update2faSettings(email, false, "NONE", null);
        return ResponseEntity.ok(ApiResponse.success(null, "2FA desactive"));
    }

    @PostMapping("/admin/create-rh")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<CreateRhResponse>> createRhByAdmin(@Valid @RequestBody CreateRhRequest registerRequest) {
        ResponseEntity<CreateRhResponse> response = organisationServiceClient.createRhUser(registerRequest);
        return ResponseEntity.status(response.getStatusCode())
                .body(ApiResponse.success(response.getBody(), "RH cree avec succes"));
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<RegisterResponse>> registerUser(@Valid @RequestBody RegisterRequest registerRequest) {
        log.info("REGISTRATION request received for email: {}", registerRequest.getEmail());
        
        ResponseEntity<UtilisateurAuthDTO> response = organisationServiceClient.registerUser(registerRequest);
        UtilisateurAuthDTO user = response.getBody();

        if (user != null && "PENDING".equals(user.getStatut())) {
            log.info("Registration successful but status is PENDING for userId={}. Skipping auto-login.", user.getId());
            RegisterResponse pendingResponse = new RegisterResponse(
                    null,
                    user.getId(),
                    user.getEmail(),
                    extractRoles(user),
                    "INSCRIPTION_PENDING"
            );
            return new ResponseEntity<>(ApiResponse.success(pendingResponse, "Inscription réussie. Votre compte est en attente de validation par l'administration."), HttpStatus.CREATED);
        }

        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(registerRequest.getEmail(), registerRequest.getMotDePasse())
            );

            SecurityContextHolder.getContext().setAuthentication(authentication);

            String jwt = jwtUtils.generateJwtToken(authentication);

            UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();
            List<String> roles = userDetails.getAuthorities().stream()
                    .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                    .toList();

            RegisterResponse registerResponse = new RegisterResponse(
                    jwt,
                    userDetails.getId(),
                    userDetails.getEmail(),
                    roles,
                    "Inscription reussie"
            );

            return new ResponseEntity<>(ApiResponse.success(registerResponse, "Inscription reussie"), HttpStatus.CREATED);
        } catch (AuthenticationException e) {
            log.warn("Auto-login failed after registration for {}: {}", registerRequest.getEmail(), e.getMessage());
            RegisterResponse fallbackResponse = new RegisterResponse(
                    null,
                    user != null ? user.getId() : null,
                    registerRequest.getEmail(),
                    user != null ? extractRoles(user) : null,
                    "INSCRIPTION_PENDING"
            );
            return new ResponseEntity<>(ApiResponse.success(fallbackResponse, "Inscription réussie. Votre compte est en attente de validation."), HttpStatus.CREATED);
        }
    }

    @GetMapping("/validate")
    public ResponseEntity<?> validateToken(@RequestParam String token) {
        if (jwtUtils.validateJwtToken(token)) {
            return ResponseEntity.ok(ApiResponse.success("Token is valid", "Succes"));
        }
        return ResponseEntity.badRequest()
                .body(ApiResponse.failure("INVALID_TOKEN", "Token is invalid"));
    }

    private List<String> extractRoles(UtilisateurAuthDTO dto) {
        if (dto.getRoles() == null || dto.getRoles().isEmpty()) {
            return List.of();
        }
        return dto.getRoles().stream()
                .map(UtilisateurAuthDTO.RoleDTO::getNom)
                .toList();
    }

    private String getEmailFromAuthentication(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            return null;
        }

        Object principal = authentication.getPrincipal();
        if (principal instanceof UserDetailsImpl userDetails) {
            return userDetails.getEmail();
        }
        if (principal instanceof String value) {
            return value;
        }
        return null;
    }
}
