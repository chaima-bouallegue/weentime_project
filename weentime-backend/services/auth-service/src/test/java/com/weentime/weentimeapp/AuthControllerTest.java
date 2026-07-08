package com.weentime.weentimeapp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.controller.AuthController;
import com.weentime.weentimeapp.dto.LoginRequest;
import com.weentime.weentimeapp.dto.TwoFactorSendRequest;
import com.weentime.weentimeapp.dto.UtilisateurAuthDTO;
import com.weentime.weentimeapp.dto.Verify2faRequest;
import com.weentime.weentimeapp.security.JwtUtils;
import com.weentime.weentimeapp.security.services.EmailService;
import com.weentime.weentimeapp.security.services.SmsOtpSender;
import com.weentime.weentimeapp.security.services.TwoFactorService;
import com.weentime.weentimeapp.security.services.UserDetailsImpl;
import com.weentime.weentimeapp.service.TokenBlacklistService;
import com.weentime.weentimeapp.service.RefreshTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
class AuthControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    AuthenticationManager authenticationManager;
    @MockitoBean
    JwtUtils jwtUtils;
    @MockitoBean
    OrganisationServiceClient organisationServiceClient;
    @MockitoBean
    TwoFactorService twoFactorService;
    @MockitoBean
    EmailService emailService;
    @MockitoBean
    SmsOtpSender smsOtpSender;
    @MockitoBean
    TokenBlacklistService tokenBlacklistService;
    @MockitoBean
    RefreshTokenService refreshTokenService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private UserDetailsImpl userDetails;
    private Authentication authentication;

    @BeforeEach
    void setup() {
        userDetails = new UserDetailsImpl(
                1L,
                "user@test.com",
                "pass",
                "ACTIF",
                10L,
                List.of(new SimpleGrantedAuthority("ROLE_EMPLOYEE")),
                false,
                null,
                null
        );
        authentication = new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
    }

    @Test
    void login_success() throws Exception {
        Mockito.when(authenticationManager.authenticate(any(Authentication.class))).thenReturn(authentication);
        Mockito.when(jwtUtils.generateJwtToken(authentication)).thenReturn("jwt-token");

        LoginRequest req = new LoginRequest();
        req.setEmail("user@test.com");
        req.setPassword("secret");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.token").value(nullValue()))
                .andExpect(jsonPath("$.error").isEmpty());
    }

    @Test
    void login_with_2fa_returns_temporary_token_not_final_jwt() throws Exception {
        UserDetailsImpl twoFactorUser = new UserDetailsImpl(
                1L,
                "user@test.com",
                "pass",
                "ACTIF",
                10L,
                List.of(new SimpleGrantedAuthority("ROLE_EMPLOYEE")),
                true,
                "TOTP",
                "encrypted-secret"
        );
        Authentication twoFactorAuthentication = new UsernamePasswordAuthenticationToken(
                twoFactorUser,
                null,
                twoFactorUser.getAuthorities()
        );
        Mockito.when(authenticationManager.authenticate(any(Authentication.class))).thenReturn(twoFactorAuthentication);
        Mockito.when(jwtUtils.generateMfaLoginToken("user@test.com", "TOTP")).thenReturn("mfa-token");

        LoginRequest req = new LoginRequest();
        req.setEmail("user@test.com");
        req.setPassword("secret");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.mfaRequired").value(true))
                .andExpect(jsonPath("$.data.message").value("MFA_REQUIRED"))
                .andExpect(jsonPath("$.data.requires2FA").value(true))
                .andExpect(jsonPath("$.data.requiresTwoFactor").value(true))
                .andExpect(jsonPath("$.data.mfaToken").value("mfa-token"))
                .andExpect(jsonPath("$.data.token").value(nullValue()))
                .andExpect(jsonPath("$.data.availableMethods", hasItem("TOTP")));

        Mockito.verify(jwtUtils, Mockito.never()).generateJwtToken(any(Authentication.class));
    }

    @Test
    void send2fa_returns_totp_only_when_email_sms_disabled() throws Exception {
        TwoFactorSendRequest request = new TwoFactorSendRequest();
        request.setMethod("EMAIL");
        request.setPurpose("LOGIN");

        mockMvc.perform(post("/api/v1/auth/2fa/send")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error").value("TOTP_ONLY"))
                .andExpect(jsonPath("$.message", containsString("MFA utilise uniquement TOTP")));
    }

    @Test
    void login_wrong_password() throws Exception {
        Mockito.when(authenticationManager.authenticate(any(Authentication.class)))
                .thenThrow(new BadCredentialsException("Bad credentials"));

        LoginRequest req = new LoginRequest();
        req.setEmail("user@test.com");
        req.setPassword("bad");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error").value("AUTHENTICATION_FAILED"));
    }

    @Test
    void login_user_not_found() throws Exception {
        Mockito.when(authenticationManager.authenticate(any(Authentication.class)))
                .thenThrow(new org.springframework.security.core.userdetails.UsernameNotFoundException("not found"));

        LoginRequest req = new LoginRequest();
        req.setEmail("missing@test.com");
        req.setPassword("pwd");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error").value("AUTHENTICATION_FAILED"));
    }

    @Test
    void login_service_down() throws Exception {
        Mockito.when(authenticationManager.authenticate(any(Authentication.class)))
                .thenThrow(new org.springframework.security.core.userdetails.UsernameNotFoundException("Service organisation indisponible"));

        LoginRequest req = new LoginRequest();
        req.setEmail("user@test.com");
        req.setPassword("pwd");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error").value("AUTHENTICATION_FAILED"))
                .andExpect(jsonPath("$.details").value("Service organisation indisponible"));
    }

    @Test
    void verify2fa_invalid_temp_token_returns_structured_error() throws Exception {
        Mockito.when(jwtUtils.validateJwtToken("bad-token")).thenReturn(false);

        Verify2faRequest request = new Verify2faRequest();
        request.setTempToken("bad-token");
        request.setCode("123456");

        mockMvc.perform(post("/api/v1/auth/verify-2fa")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error").value("INVALID_TEMP_TOKEN"))
                .andExpect(jsonPath("$.details").value("Token invalide ou expire"));
    }

    @Test
    void setupMfa_generatesSecretAndStoresEncryptedSetup() throws Exception {
        UtilisateurAuthDTO dto = totpUser(false);
        Mockito.when(organisationServiceClient.getUserByEmail("user@test.com")).thenReturn(ResponseEntity.ok(dto));
        Mockito.when(twoFactorService.generateTotpSecret()).thenReturn("BASE32SECRET23456");
        Mockito.when(twoFactorService.buildOtpAuthUrl("user@test.com", "BASE32SECRET23456")).thenReturn("otpauth://totp/test");
        Mockito.when(twoFactorService.encrypt("BASE32SECRET23456")).thenReturn("v2:encrypted-secret");
        Mockito.when(twoFactorService.generateQrCodeBase64("otpauth://totp/test")).thenReturn("data:image/png;base64,abc");

        mockMvc.perform(post("/api/v1/auth/mfa/setup")
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.secret").value("BASE32SECRET23456"))
                .andExpect(jsonPath("$.data.qrCodeBase64").value("data:image/png;base64,abc"))
                .andExpect(jsonPath("$.message").value("MFA_SETUP_CREATED"));

        Mockito.verify(organisationServiceClient)
                .update2faSettings("user@test.com", false, "TOTP", "v2:encrypted-secret");
    }

    @Test
    void enableMfa_validTotp_enablesTotp() throws Exception {
        UtilisateurAuthDTO dto = totpUser(false);
        dto.setTwoFactorSecret("stored-secret");
        Mockito.when(organisationServiceClient.getUserByEmail("user@test.com")).thenReturn(ResponseEntity.ok(dto));
        Mockito.when(twoFactorService.resolveTotpSecret("stored-secret", "user@test.com"))
                .thenReturn(Optional.of("plain-secret"));
        Mockito.when(twoFactorService.verifyTotpCode("plain-secret", "123456")).thenReturn(true);

        mockMvc.perform(post("/api/v1/auth/mfa/enable")
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code": "123456"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.enabled").value(true))
                .andExpect(jsonPath("$.message").value("MFA_ENABLED"));

        Mockito.verify(organisationServiceClient).update2faSettings("user@test.com", true, "TOTP", "stored-secret");
        Mockito.verify(twoFactorService).resetAttempts("user@test.com");
        Mockito.verify(organisationServiceClient).reset2faAttempts("user@test.com");
    }

    @Test
    void disableMfa_validPasswordAndTotp_disablesTotp() throws Exception {
        UtilisateurAuthDTO dto = totpUser(true);
        Mockito.when(authenticationManager.authenticate(any(Authentication.class))).thenReturn(authentication);
        Mockito.when(organisationServiceClient.getUserByEmail("user@test.com")).thenReturn(ResponseEntity.ok(dto));
        Mockito.when(twoFactorService.resolveTotpSecret("stored-secret", "user@test.com"))
                .thenReturn(Optional.of("plain-secret"));
        Mockito.when(twoFactorService.verifyTotpCode("plain-secret", "123456")).thenReturn(true);

        mockMvc.perform(post("/api/v1/auth/mfa/disable")
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "password": "secret",
                                  "code": "123456"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.enabled").value(false))
                .andExpect(jsonPath("$.message").value("MFA_DISABLED"));

        Mockito.verify(organisationServiceClient).update2faSettings("user@test.com", false, "NONE", null);
        Mockito.verify(organisationServiceClient).updateBackupCodes("user@test.com", List.of());
        Mockito.verify(twoFactorService).resetAttempts("user@test.com");
        Mockito.verify(organisationServiceClient).reset2faAttempts("user@test.com");
    }

    @Test
    void disableMfa_wrongPassword_returnsPasswordInvalid() throws Exception {
        Mockito.when(authenticationManager.authenticate(any(Authentication.class)))
                .thenThrow(new BadCredentialsException("Bad credentials"));

        mockMvc.perform(post("/api/v1/auth/mfa/disable")
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "password": "bad-password",
                                  "code": "123456"
                                }
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error").value("PASSWORD_INVALID"));

        Mockito.verify(organisationServiceClient, Mockito.never()).update2faSettings(any(), Mockito.anyBoolean(), any(), any());
    }

    @Test
    void disableMfa_wrongTotp_returnsInvalidTotp() throws Exception {
        UtilisateurAuthDTO dto = totpUser(true);
        Mockito.when(authenticationManager.authenticate(any(Authentication.class))).thenReturn(authentication);
        Mockito.when(organisationServiceClient.getUserByEmail("user@test.com")).thenReturn(ResponseEntity.ok(dto));
        Mockito.when(twoFactorService.resolveTotpSecret("stored-secret", "user@test.com"))
                .thenReturn(Optional.of("plain-secret"));
        Mockito.when(twoFactorService.verifyTotpCode("plain-secret", "123456")).thenReturn(false);

        mockMvc.perform(post("/api/v1/auth/mfa/disable")
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "password": "secret",
                                  "code": "123456"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error").value("INVALID_TOTP"));

        Mockito.verify(organisationServiceClient, Mockito.never()).update2faSettings(any(), Mockito.anyBoolean(), any(), any());
    }

    @Test
    void disableMfa_whenNotEnabled_returnsMfaNotEnabled() throws Exception {
        UtilisateurAuthDTO dto = totpUser(false);
        Mockito.when(authenticationManager.authenticate(any(Authentication.class))).thenReturn(authentication);
        Mockito.when(organisationServiceClient.getUserByEmail("user@test.com")).thenReturn(ResponseEntity.ok(dto));

        mockMvc.perform(post("/api/v1/auth/mfa/disable")
                        .principal(authentication)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "password": "secret",
                                  "code": "123456"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error").value("MFA_NOT_ENABLED"));
    }

    private UtilisateurAuthDTO totpUser(boolean enabled) {
        UtilisateurAuthDTO dto = new UtilisateurAuthDTO();
        dto.setId(1L);
        dto.setEmail("user@test.com");
        dto.setMotDePasse("encoded-password");
        dto.setStatut("ACTIF");
        dto.setEntrepriseId(10L);
        dto.setTwoFactorEnabled(enabled);
        dto.setTwoFactorType(enabled ? "TOTP" : "NONE");
        dto.setTwoFactorSecret(enabled ? "stored-secret" : null);
        return dto;
    }
}
