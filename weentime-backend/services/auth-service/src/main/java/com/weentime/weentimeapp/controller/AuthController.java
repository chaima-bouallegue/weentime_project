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
import com.weentime.weentimeapp.service.RefreshTokenService;
import com.weentime.weentimeapp.service.TokenBlacklistService;
import feign.FeignException;
import jakarta.servlet.http.Cookie;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
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

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private static final String CONST_UNAUTHORIZED = "UNAUTHORIZED";
    private static final String MSG_UNAUTHORIZED = "Utilisateur non authentifie";
    private static final String COOKIE_SAME_SITE_STRICT = "Strict";
    private static final String ERR_USER_NOT_FOUND = "USER_NOT_FOUND";
    private static final String MSG_USER_NOT_FOUND = "Utilisateur non trouve";
    private static final String ERR_INVALID_MFA_CODE = "INVALID_MFA_CODE";
    private static final String MSG_CODE_INVALID_OR_EXPIRED = "Code invalide ou expire";
    private static final String ERR_TOTP_ONLY = "TOTP_ONLY";
    private static final String MSG_TOTP_ONLY = "MFA utilise uniquement TOTP.";
    private static final String METHOD_EMAIL = "EMAIL";
    private static final String COOKIE_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_EMAIL = "email";
    private static final String KEY_ENTREPRISE_ID = "entrepriseId";
    private static final String KEY_ROLES = "roles";
    private static final String KEY_USER_ID = "userId";
    private static final String ERR_SMS_PROVIDER_NOT_CONFIGURED = "SMS_PROVIDER_NOT_CONFIGURED";

    private final AuthenticationManager authenticationManager;
    private final JwtUtils jwtUtils;
    private final OrganisationServiceClient organisationServiceClient;
    private final TwoFactorService twoFactorService;
    private final EmailService emailService;
    private final SmsOtpSender smsOtpSender;
    private final TokenBlacklistService tokenBlacklistService;
    private final RefreshTokenService refreshTokenService;

    @Value("${jwt.expirationMs}")
    private long jwtExpirationMs;

    @Value("${app.cookie.secure:true}")
    private boolean cookieSecure;

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Object>> authenticateUser(@Valid @RequestBody LoginRequest loginRequest) {
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

        log.info("LOGIN success for userId={}", userDetails.getId());
        String refreshToken = refreshTokenService.generate(
                userDetails.getEmail(), userDetails.getId(),
                userDetails.getEntrepriseId(), roles);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildJwtCookie(jwt))
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(refreshToken))
                .body(ApiResponse.success(new JwtResponse(null, userDetails.getId(), userDetails.getEmail(), userDetails.getEntrepriseId(), roles, false, null), "Authentification reussie"));
    }

    @PostMapping("/mfa/setup")
    public ResponseEntity<ApiResponse<Object>> setupMfa(Authentication authentication) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure(CONST_UNAUTHORIZED, MSG_UNAUTHORIZED));
        }

        UtilisateurAuthDTO user = organisationServiceClient.getUserByEmail(email).getBody();
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure(ERR_USER_NOT_FOUND, MSG_USER_NOT_FOUND));
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
    public ResponseEntity<ApiResponse<Object>> enableMfa(Authentication authentication, @Valid @RequestBody MfaCodeRequest request) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure(CONST_UNAUTHORIZED, MSG_UNAUTHORIZED));
        }

        UtilisateurAuthDTO user = organisationServiceClient.getUserByEmail(email).getBody();
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure(ERR_USER_NOT_FOUND, MSG_USER_NOT_FOUND));
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
                    .body(ApiResponse.failure(ERR_INVALID_MFA_CODE, MSG_CODE_INVALID_OR_EXPIRED));
        }

        organisationServiceClient.update2faSettings(email, true, "TOTP", user.getTwoFactorSecret());
        twoFactorService.resetAttempts(email);
        organisationServiceClient.reset2faAttempts(email);
        return ResponseEntity.ok(ApiResponse.success(Map.of("enabled", true), "MFA_ENABLED"));
    }

    @PostMapping("/mfa/disable")
    public ResponseEntity<ApiResponse<Object>> disableMfa(Authentication authentication,
                                        @Valid @RequestBody TwoFactorDisableRequest request) {
        String email = getEmailFromAuthentication(authentication);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure(CONST_UNAUTHORIZED, MSG_UNAUTHORIZED));
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
    public ResponseEntity<ApiResponse<Object>> verifyMfa(@Valid @RequestBody Verify2faRequest request) {
        return verifyTotpMfaLogin(request);
    }

    @PostMapping("/verify-2fa")
    public ResponseEntity<ApiResponse<Object>> verify2fa(@Valid @RequestBody Verify2faRequest request) {
        return verifyTotpMfaLogin(request);
    }

    @PostMapping("/2fa/verify")
    public ResponseEntity<ApiResponse<Object>> verify2faCanonical(@Valid @RequestBody Verify2faRequest request) {
        return verifyTotpMfaLogin(request);
    }

    private boolean isMfaTempTokenInvalid(String token) {
        return token == null || token.isBlank()
                || !jwtUtils.validateJwtToken(token)
                || !jwtUtils.isMfaLoginToken(token);
    }

    private boolean isMfaNotConfigured(UtilisateurAuthDTO dto, String type) {
        return !dto.isTwoFactorEnabled() || !isTotpMethod(type);
    }

    private boolean isUserLockoutActive(String email, UtilisateurAuthDTO dto) {
        return twoFactorService.isUserLocked(email)
                || (dto.getLockoutEnd() != null && dto.getLockoutEnd().isAfter(LocalDateTime.now()));
    }

    private ResponseEntity<ApiResponse<Object>> verifyTotpMfaLogin(Verify2faRequest request) {
        String temporaryToken = request.resolveTemporaryToken();
        if (isMfaTempTokenInvalid(temporaryToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("INVALID_TEMP_TOKEN", "Token invalide ou expire"));
        }

        String email = jwtUtils.getUserNameFromJwtToken(temporaryToken);
        String code = normalizeTotpCode(request.getCode());
        if (!isSixDigitCode(code)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.failure(ERR_INVALID_MFA_CODE, MSG_CODE_INVALID_OR_EXPIRED));
        }

        UtilisateurAuthDTO dto = organisationServiceClient.getUserByEmail(email).getBody();
        if (dto == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure(ERR_USER_NOT_FOUND, MSG_USER_NOT_FOUND));
        }
        String type = normalizeTwoFactorMethod(dto.getTwoFactorType());
        if (isMfaNotConfigured(dto, type)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.failure("MFA_TOTP_REQUIRED", "MFA TOTP n'est pas active pour ce compte."));
        }

        if (isUserLockoutActive(email, dto)) {
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
            String refreshToken = refreshTokenService.generate(
                    email, dto.getId(), dto.getEntrepriseId(), roles);
            log.info("2FA success for userId={}", dto.getId());
            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, buildJwtCookie(jwt))
                    .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(refreshToken))
                    .body(ApiResponse.success(new JwtResponse(null, dto.getId(), dto.getEmail(), dto.getEntrepriseId(), roles, false, null), "2FA verifie avec succes"));
        }

        long attempts = twoFactorService.incrementAttempts(email);
        if (attempts >= 5) {
            twoFactorService.lockUser(email);
            organisationServiceClient.register2faFailure(email);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.failure("TOO_MANY_ATTEMPTS", "Code incorrect. Trop de tentatives, compte bloque pour 10 minutes."));
        }

        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure(ERR_INVALID_MFA_CODE, MSG_CODE_INVALID_OR_EXPIRED));
    }

    @PostMapping("/2fa/send")
    public ResponseEntity<ApiResponse<Object>> send2fa(@Valid @RequestBody TwoFactorSendRequest request,
                                     jakarta.servlet.http.HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure(ERR_TOTP_ONLY, MSG_TOTP_ONLY));
    }

    @SuppressWarnings("unused")
    private ResponseEntity<ApiResponse<Object>> sendLegacyOtp2fa(TwoFactorSendRequest request,
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
    public ResponseEntity<ApiResponse<Object>> setup2fa(Authentication authentication, @RequestParam String type) {
        String normalizedType = normalizeTwoFactorMethod(type);
        if (isTotpMethod(normalizedType)) {
            return setupMfa(authentication);
        }
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure(ERR_TOTP_ONLY, MSG_TOTP_ONLY));
    }

    @PostMapping("/2fa/setup/totp")
    public ResponseEntity<ApiResponse<Object>> setupTotp(Authentication authentication) {
        return setupMfa(authentication);
    }

    @PostMapping("/2fa/confirm")
    public ResponseEntity<ApiResponse<Object>> confirm2fa(Authentication authentication, @RequestBody Map<String, String> request) {
        String type = normalizeTwoFactorMethod(request.get("type"));
        if (isTotpMethod(type)) {
            return confirmTotp(authentication, request);
        }
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure(ERR_TOTP_ONLY, MSG_TOTP_ONLY));
    }

    @PostMapping("/2fa/confirm/totp")
    public ResponseEntity<ApiResponse<Object>> confirmTotp(Authentication authentication, @RequestBody Map<String, String> request) {
        MfaCodeRequest mfaRequest = new MfaCodeRequest();
        mfaRequest.setCode(request == null ? null : request.get("code"));
        return enableMfa(authentication, mfaRequest);
    }

    @PostMapping("/2fa/setup/email")
    public ResponseEntity<ApiResponse<Object>> setupEmail2fa(Authentication authentication,
                                           jakarta.servlet.http.HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure(ERR_TOTP_ONLY, MSG_TOTP_ONLY));
    }

    @PostMapping("/2fa/setup/sms")
    public ResponseEntity<ApiResponse<Object>> setupSms2fa(Authentication authentication,
                                         jakarta.servlet.http.HttpServletRequest servletRequest) {
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.failure(ERR_TOTP_ONLY, MSG_TOTP_ONLY));
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
                    null,
                    userDetails.getId(),
                    userDetails.getEmail(),
                    roles,
                    "Inscription reussie"
            );

            return ResponseEntity.status(HttpStatus.CREATED)
                    .header(HttpHeaders.SET_COOKIE, buildJwtCookie(jwt))
                    .body(ApiResponse.success(registerResponse, "Inscription reussie"));
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

    @GetMapping("/ws-token")
    @org.springframework.security.access.prepost.PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, String>> getWsToken(
            Authentication authentication,
            jakarta.servlet.http.HttpServletRequest request) {
        if (authentication == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Extract claims from the JWT in the Authorization header
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String jwt = authHeader.substring(7);

        String email = jwtUtils.getUserNameFromJwtToken(jwt);
        Long userId = jwtUtils.getUserIdFromJwtToken(jwt);
        Long entrepriseId = jwtUtils.getEntrepriseIdFromJwtToken(jwt);
        List<String> roles = jwtUtils.getRolesFromJwtToken(jwt);

        String wsToken = jwtUtils.generateWsToken(userId, email, entrepriseId, roles, Duration.ofMinutes(5));
        return ResponseEntity.ok(Map.of("wsToken", wsToken));
    }

    private Optional<String> getCookieValue(jakarta.servlet.http.HttpServletRequest request, String name) {
        if (request.getCookies() == null) {
            return Optional.empty();
        }
        return Arrays.stream(request.getCookies())
                .filter(c -> name.equals(c.getName()))
                .map(Cookie::getValue)
                .filter(val -> val != null && !val.isEmpty())
                .findFirst();
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(jakarta.servlet.http.HttpServletRequest request,
                                     jakarta.servlet.http.HttpServletResponse response) {
        String refreshTokenValue = getCookieValue(request, COOKIE_REFRESH_TOKEN).orElse(null);
        if (refreshTokenValue == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("REFRESH_TOKEN_MISSING", "Refresh token manquant"));
        }
        Map<String, Object> data = refreshTokenService.validate(refreshTokenValue);
        if (data == null || data.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("REFRESH_TOKEN_INVALID", "Refresh token invalide ou expire"));
        }
        String email = (String) data.get(KEY_EMAIL);
        Number userId = (Number) data.get(KEY_USER_ID);
        Number entrepriseId = (Number) data.get(KEY_ENTREPRISE_ID);
        @SuppressWarnings("unchecked")
        List<String> roles = (List<String>) data.get(KEY_ROLES);
        if (email == null || userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure("REFRESH_TOKEN_INVALID", "Refresh token invalide"));
        }
        refreshTokenService.revoke(refreshTokenValue);
        String newJwt = jwtUtils.generateToken(userId.longValue(), email, entrepriseId != null ? entrepriseId.longValue() : null, roles);
        String newRefreshToken = refreshTokenService.generate(email, userId.longValue(), entrepriseId != null ? entrepriseId.longValue() : null, roles);
        log.info("Token refresh success for userId={}", userId.longValue());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildJwtCookie(newJwt))
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(newRefreshToken))
                .body(ApiResponse.success(Map.of(KEY_EMAIL, email, KEY_USER_ID, userId.longValue(), KEY_ENTREPRISE_ID, entrepriseId != null ? entrepriseId.longValue() : null, KEY_ROLES, roles), "Token rafraichi avec succes"));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(jakarta.servlet.http.HttpServletRequest request,
                                       jakarta.servlet.http.HttpServletResponse response) {
        String jwtToken = getCookieValue(request, "jwt").orElse(null);
        if (jwtToken != null) {
            String jti = jwtUtils.extractJti(jwtToken);
            if (jti != null) {
                long remaining = jwtUtils.getRemainingTtlSeconds(jwtToken);
                tokenBlacklistService.blacklist(jti, remaining);
                log.info("JWT with jti {} blacklisted for {} seconds", jti, remaining);
            }
        }
        String refreshTokenValue = getCookieValue(request, COOKIE_REFRESH_TOKEN).orElse(null);
        if (refreshTokenValue != null) {
            refreshTokenService.revoke(refreshTokenValue);
            log.info("Refresh token revoked on logout");
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, ResponseCookie.from("jwt", "")
                        .httpOnly(true).secure(cookieSecure).sameSite(COOKIE_SAME_SITE_STRICT).path("/").maxAge(0).build().toString())
                .header(HttpHeaders.SET_COOKIE, ResponseCookie.from(COOKIE_REFRESH_TOKEN, "")
                        .httpOnly(true).secure(cookieSecure).sameSite(COOKIE_SAME_SITE_STRICT).path("/api/v1/auth/refresh").maxAge(0).build().toString())
                .build();
    }

    @GetMapping("/me")
    public ResponseEntity<?> currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof UserDetailsImpl userDetails)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.failure(CONST_UNAUTHORIZED, "Non authentifie"));
        }
        List<String> roles = userDetails.getAuthorities().stream()
                .map(org.springframework.security.core.GrantedAuthority::getAuthority)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "id", userDetails.getId(),
                KEY_EMAIL, userDetails.getEmail(),
                KEY_ENTREPRISE_ID, userDetails.getEntrepriseId(),
                KEY_ROLES, roles
        ), "OK"));
    }

    private ResponseEntity<ApiResponse<Object>> sendOtpToUser(UtilisateurAuthDTO user, String method, String purpose, String ipAddress) {
        ResponseEntity<ApiResponse<Object>> validationError = validateOtpRequest(user, method);
        if (validationError != null) {
            return validationError;
        }

        String code = twoFactorService.generateOtpCode();
        String resolvedPurpose = (purpose == null || purpose.isBlank()) ? "LOGIN" : purpose;
        try {
            storeAndDispatchOtp(user, method, resolvedPurpose, code, ipAddress);
        } catch (FeignException.Conflict exception) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(ApiResponse.failure("OTP_RESEND_COOLDOWN", "Patientez avant de demander un nouveau code."));
        } catch (MailException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiResponse.failure("EMAIL_OTP_PROVIDER_NOT_CONFIGURED", "Email OTP provider is not configured."));
        } catch (IllegalStateException exception) {
            return handleSmsProviderException(exception);
        }

        return ResponseEntity.ok(ApiResponse.success(null, "Code envoye."));
    }

    private ResponseEntity<ApiResponse<Object>> validateOtpRequest(UtilisateurAuthDTO user, String method) {
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.failure(ERR_USER_NOT_FOUND, MSG_USER_NOT_FOUND));
        }
        if (!METHOD_EMAIL.equals(method) && !"SMS".equals(method)) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.failure("INVALID_2FA_METHOD", "Méthode 2FA invalide."));
        }
        if ("SMS".equals(method) && (user.getTelephone() == null || user.getTelephone().isBlank())) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.failure("PHONE_REQUIRED", "Aucun numéro de téléphone n'est associé à ce compte."));
        }
        if ("SMS".equals(method) && !smsOtpSender.isAvailable()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiResponse.failure(ERR_SMS_PROVIDER_NOT_CONFIGURED, "Service SMS indisponible pour le moment."));
        }
        return null;
    }

    private void storeAndDispatchOtp(UtilisateurAuthDTO user, String method, String purpose, String code, String ipAddress) {
        organisationServiceClient.storeTwoFactorOtp(StoreTwoFactorOtpRequest.builder()
                .email(user.getEmail())
                .method(method)
                .purpose(purpose)
                .codeHash(twoFactorService.hashBackupCode(code))
                .ipAddress(ipAddress)
                .build());
        if (METHOD_EMAIL.equals(method)) {
            emailService.sendOtpCode(user.getEmail(), code);
        } else {
            smsOtpSender.sendOtpCode(user.getTelephone(), code);
        }
    }

    private ResponseEntity<ApiResponse<Object>> handleSmsProviderException(IllegalStateException exception) {
        if (ERR_SMS_PROVIDER_NOT_CONFIGURED.equals(exception.getMessage())) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiResponse.failure(ERR_SMS_PROVIDER_NOT_CONFIGURED, "Service SMS indisponible pour le moment."));
        }
        throw exception;
    }



    private Optional<String> resolveTotpSecret(String email, String storedSecret) {
        return twoFactorService.resolveTotpSecret(storedSecret, email);
    }

    private ResponseEntity<ApiResponse<Object>> invalidMfaConfigurationResponse() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.failure(
                        "INVALID_MFA_CONFIGURATION",
                        "Configuration TOTP invalide. Reconfigurez l'authentification a deux facteurs."
                ));
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

    private String buildJwtCookie(String token) {
        return ResponseCookie.from("jwt", token)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(COOKIE_SAME_SITE_STRICT)
                .path("/")
                .maxAge(Duration.ofMillis(jwtExpirationMs))
                .build().toString();
    }

    private String buildRefreshCookie(String token) {
        return ResponseCookie.from(COOKIE_REFRESH_TOKEN, token)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(COOKIE_SAME_SITE_STRICT)
                .path("/api/v1/auth/refresh")
                .maxAge(Duration.ofDays(30))
                .build().toString();
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
