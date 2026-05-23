package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.CreateRhRequest;
import com.weentime.weentimeapp.dto.CreateRhResponse;
import com.weentime.weentimeapp.dto.JwtResponse;
import com.weentime.weentimeapp.dto.LoginRequest;
import com.weentime.weentimeapp.dto.OtpVerificationResponse;
import com.weentime.weentimeapp.dto.RegisterRequest;
import com.weentime.weentimeapp.dto.RegisterResponse;
import com.weentime.weentimeapp.dto.StoreTwoFactorOtpRequest;
import com.weentime.weentimeapp.dto.TwoFactorDisableRequest;
import com.weentime.weentimeapp.dto.TwoFactorSendRequest;
import com.weentime.weentimeapp.dto.TwoFactorSetupResponse;
import com.weentime.weentimeapp.dto.UtilisateurAuthDTO;
import com.weentime.weentimeapp.dto.Verify2faRequest;
import com.weentime.weentimeapp.dto.VerifyTwoFactorOtpRequest;
import com.weentime.weentimeapp.security.JwtUtils;
import com.weentime.weentimeapp.security.services.EmailService;
import com.weentime.weentimeapp.security.services.SmsOtpSender;
import com.weentime.weentimeapp.security.services.TwoFactorService;
import com.weentime.weentimeapp.security.services.UserDetailsImpl;
import feign.FeignException;
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
    private final SmsOtpSender smsOtpSender;

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
            String method = normalizeTwoFactorMethod(userDetails.getTwoFactorType());
            String tempToken = jwtUtils.generateTokenFor2FA(userDetails.getEmail(), method);

            return ResponseEntity.ok(ApiResponse.success(
                    JwtResponse.builder()
                            .requires2FA(true)
                            .requiresTwoFactor(true)
                            .tempToken(tempToken)
                            .temporaryToken(tempToken)
                            .email(userDetails.getEmail())
                            .availableMethods(availableMethods(method))
                            .maskedEmail(maskEmail(userDetails.getEmail()))
                            .maskedPhone(maskPhone(userDetails.getTelephone()))
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
        return verify2faCanonical(request);
    }

    @PostMapping("/2fa/verify")
    public ResponseEntity<?> verify2faCanonical(@Valid @RequestBody Verify2faRequest request) {
        String temporaryToken = request.resolveTemporaryToken();
        if (temporaryToken == null || temporaryToken.isBlank()
                || !jwtUtils.validateJwtToken(temporaryToken)
                || !jwtUtils.isTwoFactorToken(temporaryToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("INVALID_TEMP_TOKEN", "Token invalide ou expire"));
        }

        String email = jwtUtils.getUserNameFromJwtToken(temporaryToken);
        String type = normalizeTwoFactorMethod(
                request.getMethod() != null && !request.getMethod().isBlank()
                        ? request.getMethod()
                        : jwtUtils.getTypeFrom2faToken(temporaryToken)
        );

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
        if (isTotpMethod(type)) {
            String plainSecret = twoFactorService.decrypt(dto.getTwoFactorSecret());
            isValid = twoFactorService.verifyTotpCode(plainSecret, request.getCode());
        } else {
            OtpVerificationResponse otpResult = organisationServiceClient.verifyTwoFactorOtp(VerifyTwoFactorOtpRequest.builder()
                    .email(email)
                    .method(type)
                    .purpose("LOGIN")
                    .code(request.getCode())
                    .build()).getBody();
            isValid = otpResult != null && otpResult.isValid();
            if (!isValid && otpResult != null) {
                return otpFailureResponse(otpResult);
            }
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

    @PostMapping("/2fa/send")
    public ResponseEntity<?> send2fa(@Valid @RequestBody TwoFactorSendRequest request,
                                     jakarta.servlet.http.HttpServletRequest servletRequest) {
        String temporaryToken = request.resolveTemporaryToken();
        if (temporaryToken == null || temporaryToken.isBlank()
                || !jwtUtils.validateJwtToken(temporaryToken)
                || !jwtUtils.isTwoFactorToken(temporaryToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("INVALID_TEMP_TOKEN", "Token invalide ou expire"));
        }

        String email = jwtUtils.getUserNameFromJwtToken(temporaryToken);
        String tokenMethod = normalizeTwoFactorMethod(jwtUtils.getTypeFrom2faToken(temporaryToken));
        String requestedMethod = normalizeTwoFactorMethod(request.getMethod());
        if (!tokenMethod.equals(requestedMethod)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.failure("METHOD_NOT_ALLOWED", "Méthode 2FA non autorisée pour cette connexion."));
        }

        UtilisateurAuthDTO user = organisationServiceClient.getUserByEmail(email).getBody();
        return sendOtpToUser(user, requestedMethod, request.getPurpose(), getClientIp(servletRequest));
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<?> setup2fa(Authentication authentication, @RequestParam String type) {
        String normalizedType = normalizeTwoFactorMethod(type);
        if (isTotpMethod(normalizedType)) {
            return setupTotp(authentication);
        }
        return setupOtpForAuthenticatedUser(authentication, normalizedType, "ENABLE_2FA", null);
    }

    @PostMapping("/2fa/setup/totp")
    public ResponseEntity<?> setupTotp(Authentication authentication) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }

        String secret = twoFactorService.generateTotpSecret();
        String otpauthUrl = twoFactorService.buildOtpAuthUrl(email, secret);
        return ResponseEntity.ok(ApiResponse.success(
                TwoFactorSetupResponse.builder()
                        .secret(secret)
                        .otpauthUrl(otpauthUrl)
                        .qrCodeBase64(twoFactorService.generateQrCodeBase64(otpauthUrl))
                        .build(),
                "Configuration TOTP generee"
        ));
    }

    @PostMapping("/2fa/confirm")
    public ResponseEntity<?> confirm2fa(Authentication authentication, @RequestBody Map<String, String> request) {
        String type = normalizeTwoFactorMethod(request.get("type"));
        if (isTotpMethod(type)) {
            return confirmTotp(authentication, request);
        }
        return confirmOtpSetup(authentication, request, type);
    }

    @PostMapping("/2fa/confirm/totp")
    public ResponseEntity<?> confirmTotp(Authentication authentication, @RequestBody Map<String, String> request) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }

        String code = request.get("code");
        String secret = request.get("secret");
        boolean isValid = secret != null && code != null && twoFactorService.verifyTotpCode(secret, code);
        String secretToSave = isValid ? twoFactorService.encrypt(secret) : null;

        if (isValid) {
            organisationServiceClient.update2faSettings(email, true, "TOTP", secretToSave);

            List<String> backupCodes = refreshBackupCodes(email);

            return ResponseEntity.ok(ApiResponse.success(Map.of("backupCodes", backupCodes), "2FA active avec succes"));
        }

        return ResponseEntity.badRequest()
                .body(ApiResponse.failure("INVALID_CONFIRMATION_CODE", "Code de confirmation invalide"));
    }

    @PostMapping("/2fa/setup/email")
    public ResponseEntity<?> setupEmail2fa(Authentication authentication,
                                           jakarta.servlet.http.HttpServletRequest servletRequest) {
        return setupOtpForAuthenticatedUser(authentication, "EMAIL", "ENABLE_2FA", getClientIp(servletRequest));
    }

    @PostMapping("/2fa/setup/sms")
    public ResponseEntity<?> setupSms2fa(Authentication authentication,
                                         jakarta.servlet.http.HttpServletRequest servletRequest) {
        return setupOtpForAuthenticatedUser(authentication, "SMS", "ENABLE_2FA", getClientIp(servletRequest));
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<?> disable2fa(Authentication authentication,
                                        @RequestBody(required = false) TwoFactorDisableRequest request) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }

        if (!canDisable2fa(email, request)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("INVALID_2FA_DISABLE_CONFIRMATION", "Mot de passe ou code 2FA valide requis."));
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

    private ResponseEntity<?> setupOtpForAuthenticatedUser(Authentication authentication, String method, String purpose, String ipAddress) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }
        UtilisateurAuthDTO user = organisationServiceClient.getUserByEmail(email).getBody();
        ResponseEntity<?> sendResponse = sendOtpToUser(user, method, purpose, ipAddress);
        if (!sendResponse.getStatusCode().is2xxSuccessful()) {
            return sendResponse;
        }
        String setupToken = jwtUtils.generateTokenFor2FA(email, method);
        return ResponseEntity.ok(ApiResponse.success(
                TwoFactorSetupResponse.builder().setupToken(setupToken).build(),
                method + " OTP envoye"
        ));
    }

    private ResponseEntity<?> confirmOtpSetup(Authentication authentication, Map<String, String> request, String method) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }
        String setupToken = request.get("setupToken");
        if (setupToken == null || !jwtUtils.validateJwtToken(setupToken) || !jwtUtils.isTwoFactorToken(setupToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("INVALID_SETUP_TOKEN", "Token de configuration invalide ou expire."));
        }
        OtpVerificationResponse otpResult = organisationServiceClient.verifyTwoFactorOtp(VerifyTwoFactorOtpRequest.builder()
                .email(email)
                .method(method)
                .purpose("ENABLE_2FA")
                .code(request.get("code"))
                .build()).getBody();
        if (otpResult == null || !otpResult.isValid()) {
            return otpFailureResponse(otpResult);
        }
        organisationServiceClient.update2faSettings(email, true, method, null);
        List<String> backupCodes = refreshBackupCodes(email);
        return ResponseEntity.ok(ApiResponse.success(Map.of("backupCodes", backupCodes), "2FA active avec succes"));
    }

    private ResponseEntity<?> sendOtpToUser(UtilisateurAuthDTO user, String method, String purpose, String ipAddress) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("USER_NOT_FOUND", "Utilisateur non trouve"));
        }
        if (!"EMAIL".equals(method) && !"SMS".equals(method)) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.failure("INVALID_2FA_METHOD", "Méthode 2FA invalide."));
        }
        if ("SMS".equals(method) && (user.getTelephone() == null || user.getTelephone().isBlank())) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.failure("PHONE_REQUIRED", "Aucun numéro de téléphone n'est associé à ce compte."));
        }

        String code = twoFactorService.generateOtpCode();
        try {
            if ("EMAIL".equals(method)) {
                emailService.sendOtpCode(user.getEmail(), code);
            } else {
                smsOtpSender.sendOtpCode(user.getTelephone(), code);
            }
            organisationServiceClient.storeTwoFactorOtp(StoreTwoFactorOtpRequest.builder()
                    .email(user.getEmail())
                    .method(method)
                    .purpose(purpose == null || purpose.isBlank() ? "LOGIN" : purpose)
                    .codeHash(twoFactorService.hashBackupCode(code))
                    .ipAddress(ipAddress)
                    .build());
        } catch (FeignException.Conflict exception) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.failure("OTP_RESEND_COOLDOWN", "Patientez avant de demander un nouveau code."));
        } catch (IllegalStateException exception) {
            if ("SMS_PROVIDER_NOT_CONFIGURED".equals(exception.getMessage())) {
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                        .body(ApiResponse.failure("SMS_PROVIDER_NOT_CONFIGURED", "Service SMS indisponible pour le moment."));
            }
            throw exception;
        }

        return ResponseEntity.ok(ApiResponse.success(null, "Code envoye."));
    }

    private ResponseEntity<?> otpFailureResponse(OtpVerificationResponse otpResult) {
        if (otpResult == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("INVALID_2FA_CODE", "Code incorrect."));
        }
        HttpStatus status = "TOO_MANY_ATTEMPTS".equals(otpResult.getReason())
                ? HttpStatus.TOO_MANY_REQUESTS
                : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status)
                .body(ApiResponse.failure(otpResult.getReason(), otpResult.getMessage()));
    }

    private boolean canDisable2fa(String email, TwoFactorDisableRequest request) {
        if (request == null) {
            return false;
        }
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            try {
                authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(email, request.getPassword()));
                return true;
            } catch (AuthenticationException exception) {
                return false;
            }
        }
        if (request.getCode() == null || request.getCode().isBlank()) {
            return false;
        }
        UtilisateurAuthDTO dto = organisationServiceClient.getUserByEmail(email).getBody();
        if (dto == null || !dto.isTwoFactorEnabled()) {
            return false;
        }
        String method = normalizeTwoFactorMethod(dto.getTwoFactorType());
        if (isTotpMethod(method)) {
            return twoFactorService.verifyTotpCode(twoFactorService.decrypt(dto.getTwoFactorSecret()), request.getCode());
        }
        OtpVerificationResponse otpResult = organisationServiceClient.verifyTwoFactorOtp(VerifyTwoFactorOtpRequest.builder()
                .email(email)
                .method(method)
                .purpose("LOGIN")
                .code(request.getCode())
                .build()).getBody();
        return otpResult != null && otpResult.isValid();
    }

    private List<String> refreshBackupCodes(String email) {
        List<String> backupCodes = new ArrayList<>();
        List<String> hashedBackupCodes = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            String backupCode = twoFactorService.generateOtpCode();
            backupCodes.add(backupCode);
            hashedBackupCodes.add(twoFactorService.hashBackupCode(backupCode));
        }
        organisationServiceClient.updateBackupCodes(email, hashedBackupCodes);
        return backupCodes;
    }

    private List<String> availableMethods(String method) {
        return List.of(normalizeTwoFactorMethod(method));
    }

    private String normalizeTwoFactorMethod(String method) {
        String normalized = method == null || method.isBlank() ? "TOTP" : method.trim().toUpperCase();
        return "AUTHENTICATOR".equals(normalized) ? "TOTP" : normalized;
    }

    private boolean isTotpMethod(String method) {
        String normalized = normalizeTwoFactorMethod(method);
        return "TOTP".equals(normalized) || "AUTHENTICATOR".equals(normalized);
    }

    private String maskEmail(String email) {
        if (email == null || !email.contains("@")) {
            return "";
        }
        String[] parts = email.split("@", 2);
        String local = parts[0];
        String visible = local.isEmpty() ? "" : local.substring(0, 1);
        return visible + "***@" + parts[1];
    }

    private String maskPhone(String phone) {
        if (phone == null || phone.length() < 4) {
            return null;
        }
        return phone.substring(0, Math.min(4, phone.length())) + " *** ** " + phone.substring(phone.length() - 3);
    }

    private String getClientIp(jakarta.servlet.http.HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
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
