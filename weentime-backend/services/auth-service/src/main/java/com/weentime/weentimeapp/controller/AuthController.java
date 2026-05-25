package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.CreateRhRequest;
import com.weentime.weentimeapp.dto.CreateRhResponse;
import com.weentime.weentimeapp.dto.JwtResponse;
import com.weentime.weentimeapp.dto.LoginRequest;
import com.weentime.weentimeapp.dto.MfaCodeRequest;
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
import org.springframework.mail.MailException;
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
import java.util.Optional;

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
            if (!isTotpMethod(method)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(ApiResponse.failure("MFA_TOTP_REQUIRED", "La configuration MFA doit utiliser TOTP."));
            }
            String tempToken = jwtUtils.generateMfaLoginToken(userDetails.getEmail(), "TOTP");

            return ResponseEntity.ok(ApiResponse.success(
                    JwtResponse.builder()
                            .mfaRequired(true)
                            .mfaToken(tempToken)
                            .message("MFA_REQUIRED")
                            .requires2FA(true)
                            .requiresTwoFactor(true)
                            .tempToken(tempToken)
                            .temporaryToken(tempToken)
                            .id(userDetails.getId())
                            .userId(userDetails.getId())
                            .email(userDetails.getEmail())
                            .availableMethods(List.of("TOTP"))
                            .build(),
                    "MFA_REQUIRED"
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

    @PostMapping("/mfa/setup")
    public ResponseEntity<?> setupMfa(Authentication authentication) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }

        UtilisateurAuthDTO user = organisationServiceClient.getUserByEmail(email).getBody();
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("USER_NOT_FOUND", "Utilisateur non trouve"));
        }
        if (user.isTwoFactorEnabled()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ApiResponse.failure("MFA_ALREADY_ENABLED", "MFA est deja active pour ce compte."));
        }

        String secret = twoFactorService.generateTotpSecret();
        String qrCodeUri = twoFactorService.buildOtpAuthUrl(email, secret);
        organisationServiceClient.update2faSettings(email, false, "TOTP", twoFactorService.encrypt(secret));

        return ResponseEntity.ok(ApiResponse.success(
                TwoFactorSetupResponse.builder()
                        .secret(secret)
                        .qrCodeUri(qrCodeUri)
                        .otpauthUrl(qrCodeUri)
                        .qrCodeBase64(twoFactorService.generateQrCodeBase64(qrCodeUri))
                        .build(),
                "MFA_SETUP_CREATED"
        ));
    }

    @PostMapping("/mfa/enable")
    public ResponseEntity<?> enableMfa(Authentication authentication, @Valid @RequestBody MfaCodeRequest request) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }

        UtilisateurAuthDTO user = organisationServiceClient.getUserByEmail(email).getBody();
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("USER_NOT_FOUND", "Utilisateur non trouve"));
        }
        if (user.getTwoFactorSecret() == null || user.getTwoFactorSecret().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("MFA_SETUP_REQUIRED", "Configurez MFA avant de l'activer."));
        }

        Optional<String> secret = resolveTotpSecret(email, user.getTwoFactorSecret());
        if (secret.isEmpty()) {
            return invalidMfaConfigurationResponse();
        }
        String code = normalizeTotpCode(request.getCode());
        if (!twoFactorService.verifyTotpCode(secret.get(), code)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("INVALID_MFA_CODE", "Code invalide ou expire"));
        }

        organisationServiceClient.update2faSettings(email, true, "TOTP", user.getTwoFactorSecret());
        twoFactorService.resetAttempts(email);
        organisationServiceClient.reset2faAttempts(email);
        return ResponseEntity.ok(ApiResponse.success(Map.of("enabled", true), "MFA_ENABLED"));
    }

    @PostMapping("/mfa/disable")
    public ResponseEntity<?> disableMfa(Authentication authentication,
                                        @Valid @RequestBody TwoFactorDisableRequest request) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("UNAUTHORIZED", "Utilisateur non authentifie"));
        }
        if (request == null || request.getPassword() == null || request.getPassword().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("PASSWORD_REQUIRED", "Mot de passe requis."));
        }
        String code = normalizeTotpCode(request.getCode());
        if (!isSixDigitCode(code)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("INVALID_TOTP", "Code MFA invalide ou expire."));
        }

        try {
            authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(email, request.getPassword()));
        } catch (AuthenticationException exception) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("PASSWORD_INVALID", "Mot de passe incorrect."));
        }

        UtilisateurAuthDTO user = organisationServiceClient.getUserByEmail(email).getBody();
        if (user == null || !user.isTwoFactorEnabled() || user.getTwoFactorSecret() == null || user.getTwoFactorSecret().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("MFA_NOT_ENABLED", "MFA n'est pas active pour ce compte."));
        }

        Optional<String> secret = resolveTotpSecret(email, user.getTwoFactorSecret());
        if (secret.isEmpty()) {
            return invalidMfaConfigurationResponse();
        }
        if (!twoFactorService.verifyTotpCode(secret.get(), code)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("INVALID_TOTP", "Code MFA invalide ou expire."));
        }

        organisationServiceClient.update2faSettings(email, false, "NONE", null);
        organisationServiceClient.updateBackupCodes(email, List.of());
        twoFactorService.resetAttempts(email);
        organisationServiceClient.reset2faAttempts(email);
        return ResponseEntity.ok(ApiResponse.success(Map.of("enabled", false), "MFA_DISABLED"));
    }

    @PostMapping("/mfa/verify")
    public ResponseEntity<?> verifyMfa(@Valid @RequestBody Verify2faRequest request) {
        return verifyTotpMfaLogin(request);
    }

    @PostMapping("/verify-2fa")
    public ResponseEntity<?> verify2fa(@Valid @RequestBody Verify2faRequest request) {
        return verifyTotpMfaLogin(request);
    }

    @PostMapping("/2fa/verify")
    public ResponseEntity<?> verify2faCanonical(@Valid @RequestBody Verify2faRequest request) {
        return verifyTotpMfaLogin(request);
    }

    private ResponseEntity<?> verifyTotpMfaLogin(Verify2faRequest request) {
        String temporaryToken = request.resolveTemporaryToken();
        if (temporaryToken == null || temporaryToken.isBlank()
                || !jwtUtils.validateJwtToken(temporaryToken)
                || !jwtUtils.isMfaLoginToken(temporaryToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("INVALID_TEMP_TOKEN", "Token invalide ou expire"));
        }

        String email = jwtUtils.getUserNameFromJwtToken(temporaryToken);
        String code = normalizeTotpCode(request.getCode());
        if (!isSixDigitCode(code)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("INVALID_MFA_CODE", "Code invalide ou expire"));
        }

        UtilisateurAuthDTO dto = organisationServiceClient.getUserByEmail(email).getBody();
        if (dto == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure("USER_NOT_FOUND", "Utilisateur non trouve"));
        }
        String type = normalizeTwoFactorMethod(dto.getTwoFactorType());
        if (!dto.isTwoFactorEnabled() || !isTotpMethod(type)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.failure("MFA_TOTP_REQUIRED", "MFA TOTP n'est pas active pour ce compte."));
        }

        if (twoFactorService.isUserLocked(email)
                || (dto.getLockoutEnd() != null && dto.getLockoutEnd().isAfter(LocalDateTime.now()))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.failure("ACCOUNT_LOCKED", "Trop de tentatives. Compte bloque. Reessayez plus tard."));
        }

        if (dto.getTwoFactorSecret() == null || dto.getTwoFactorSecret().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure("INVALID_MFA_CONFIGURATION", "Configuration TOTP introuvable."));
        }

        Optional<String> plainSecret = resolveTotpSecret(email, dto.getTwoFactorSecret());
        if (plainSecret.isEmpty()) {
            return invalidMfaConfigurationResponse();
        }

        boolean isValid = twoFactorService.verifyTotpCode(plainSecret.get(), code);
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

        long attempts = twoFactorService.incrementAttempts(email);
        if (attempts >= 5) {
            twoFactorService.lockUser(email);
            organisationServiceClient.register2faFailure(email);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.failure("TOO_MANY_ATTEMPTS", "Code incorrect. Trop de tentatives, compte bloque pour 10 minutes."));
        }

        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure("INVALID_MFA_CODE", "Code invalide ou expire"));
    }

    @PostMapping("/2fa/send")
    public ResponseEntity<?> send2fa(@Valid @RequestBody TwoFactorSendRequest request,
                                     jakarta.servlet.http.HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure("TOTP_ONLY", "MFA utilise uniquement TOTP."));
    }

    @SuppressWarnings("unused")
    private ResponseEntity<?> sendLegacyOtp2fa(TwoFactorSendRequest request,
                                               jakarta.servlet.http.HttpServletRequest servletRequest) {
        String temporaryToken = request.resolveTemporaryToken();
        if (temporaryToken == null || temporaryToken.isBlank()
                || !jwtUtils.validateJwtToken(temporaryToken)
                || !jwtUtils.isTwoFactorToken(temporaryToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("INVALID_TEMP_TOKEN", "Token invalide ou expire"));
        }

        String email = jwtUtils.getUserNameFromJwtToken(temporaryToken);
        String requestedMethod = normalizeTwoFactorMethod(request.getMethod());
        if (!"EMAIL".equals(requestedMethod) && !"SMS".equals(requestedMethod)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.failure("METHOD_NOT_ALLOWED", "Méthode 2FA non autorisée pour cette connexion."));
        }

        UtilisateurAuthDTO user = organisationServiceClient.getUserByEmail(email).getBody();
        if (!isMethodAvailable(user, requestedMethod)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.failure("METHOD_NOT_ALLOWED", "Methode 2FA non autorisee pour cette connexion."));
        }
        return sendOtpToUser(user, requestedMethod, request.getPurpose(), getClientIp(servletRequest));
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<?> setup2fa(Authentication authentication, @RequestParam String type) {
        String normalizedType = normalizeTwoFactorMethod(type);
        if (isTotpMethod(normalizedType)) {
            return setupMfa(authentication);
        }
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure("TOTP_ONLY", "MFA utilise uniquement TOTP."));
    }

    @PostMapping("/2fa/setup/totp")
    public ResponseEntity<?> setupTotp(Authentication authentication) {
        return setupMfa(authentication);
    }

    @PostMapping("/2fa/confirm")
    public ResponseEntity<?> confirm2fa(Authentication authentication, @RequestBody Map<String, String> request) {
        String type = normalizeTwoFactorMethod(request.get("type"));
        if (isTotpMethod(type)) {
            return confirmTotp(authentication, request);
        }
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure("TOTP_ONLY", "MFA utilise uniquement TOTP."));
    }

    @PostMapping("/2fa/confirm/totp")
    public ResponseEntity<?> confirmTotp(Authentication authentication, @RequestBody Map<String, String> request) {
        MfaCodeRequest mfaRequest = new MfaCodeRequest();
        mfaRequest.setCode(request == null ? null : request.get("code"));
        return enableMfa(authentication, mfaRequest);
    }

    @PostMapping("/2fa/setup/email")
    public ResponseEntity<?> setupEmail2fa(Authentication authentication,
                                           jakarta.servlet.http.HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure("TOTP_ONLY", "MFA utilise uniquement TOTP."));
    }

    @PostMapping("/2fa/setup/sms")
    public ResponseEntity<?> setupSms2fa(Authentication authentication,
                                         jakarta.servlet.http.HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure("TOTP_ONLY", "MFA utilise uniquement TOTP."));
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<?> disable2fa(Authentication authentication,
                                        @RequestBody(required = false) TwoFactorDisableRequest request) {
        return disableMfa(authentication, request);
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

        if ("SMS".equals(method) && !smsOtpSender.isAvailable()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiResponse.failure("SMS_PROVIDER_NOT_CONFIGURED", "Service SMS indisponible pour le moment."));
        }

        String code = twoFactorService.generateOtpCode();
        try {
            organisationServiceClient.storeTwoFactorOtp(StoreTwoFactorOtpRequest.builder()
                    .email(user.getEmail())
                    .method(method)
                    .purpose(purpose == null || purpose.isBlank() ? "LOGIN" : purpose)
                    .codeHash(twoFactorService.hashBackupCode(code))
                    .ipAddress(ipAddress)
                    .build());
            if ("EMAIL".equals(method)) {
                emailService.sendOtpCode(user.getEmail(), code);
            } else {
                smsOtpSender.sendOtpCode(user.getTelephone(), code);
            }
        } catch (FeignException.Conflict exception) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.failure("OTP_RESEND_COOLDOWN", "Patientez avant de demander un nouveau code."));
        } catch (MailException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiResponse.failure("EMAIL_OTP_PROVIDER_NOT_CONFIGURED", "Email OTP provider is not configured."));
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
            if (dto.getTwoFactorSecret() == null || dto.getTwoFactorSecret().isBlank()) {
                return false;
            }
            Optional<String> secret = resolveTotpSecret(email, dto.getTwoFactorSecret());
            return secret.isPresent() && twoFactorService.verifyTotpCode(secret.get(), normalizeTotpCode(request.getCode()));
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

    private Optional<String> resolveTotpSecret(String email, String storedSecret) {
        return twoFactorService.resolveTotpSecret(storedSecret, email);
    }

    private ResponseEntity<?> invalidMfaConfigurationResponse() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure(
                        "INVALID_MFA_CONFIGURATION",
                        "Configuration TOTP invalide. Reconfigurez l'authentification a deux facteurs."
                ));
    }

    private List<String> availableMethods(UserDetailsImpl userDetails) {
        return List.of("TOTP");
    }

    private List<String> availableMethods(UtilisateurAuthDTO user) {
        return user == null || !user.isTwoFactorEnabled() ? List.of() : List.of("TOTP");
    }

    private boolean isMethodAvailable(UtilisateurAuthDTO user, String method) {
        return availableMethods(user).contains(normalizeTwoFactorMethod(method));
    }

    private String normalizeTwoFactorMethod(String method) {
        String normalized = method == null || method.isBlank() ? "TOTP" : method.trim().toUpperCase();
        return "AUTHENTICATOR".equals(normalized) ? "TOTP" : normalized;
    }

    private boolean isTotpMethod(String method) {
        String normalized = normalizeTwoFactorMethod(method);
        return "TOTP".equals(normalized) || "AUTHENTICATOR".equals(normalized);
    }

    private boolean isSixDigitCode(String code) {
        return code != null && code.matches("\\d{6}");
    }

    private String normalizeTotpCode(String code) {
        return code == null ? null : code.replaceAll("\\s+", "");
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
