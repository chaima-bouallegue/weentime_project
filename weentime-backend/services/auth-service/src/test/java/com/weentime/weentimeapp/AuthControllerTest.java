package com.weentime.weentimeapp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.weentime.weentimeapp.client.OrganisationServiceClient;
import com.weentime.weentimeapp.controller.AuthController;
import com.weentime.weentimeapp.dto.LoginRequest;
import com.weentime.weentimeapp.dto.StoreTwoFactorOtpRequest;
import com.weentime.weentimeapp.dto.TwoFactorSendRequest;
import com.weentime.weentimeapp.dto.UtilisateurAuthDTO;
import com.weentime.weentimeapp.dto.Verify2faRequest;
import com.weentime.weentimeapp.security.JwtUtils;
import com.weentime.weentimeapp.security.services.EmailService;
import com.weentime.weentimeapp.security.services.SmsOtpSender;
import com.weentime.weentimeapp.security.services.TwoFactorService;
import com.weentime.weentimeapp.security.services.UserDetailsImpl;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
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
                .andExpect(jsonPath("$.data.token").value("jwt-token"))
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
        Mockito.when(jwtUtils.generateTokenFor2FA("user@test.com", "TOTP")).thenReturn("temp-token");

        LoginRequest req = new LoginRequest();
        req.setEmail("user@test.com");
        req.setPassword("secret");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.requires2FA").value(true))
                .andExpect(jsonPath("$.data.requiresTwoFactor").value(true))
                .andExpect(jsonPath("$.data.tempToken").value("temp-token"))
                .andExpect(jsonPath("$.data.temporaryToken").value("temp-token"))
                .andExpect(jsonPath("$.data.token").isEmpty())
                .andExpect(jsonPath("$.data.availableMethods[0]").value("TOTP"))
                .andExpect(jsonPath("$.data.availableMethods[1]").value("EMAIL"));
    }

    @Test
    void send2fa_allows_email_fallback_with_valid_temporary_token() throws Exception {
        UtilisateurAuthDTO dto = new UtilisateurAuthDTO();
        dto.setEmail("user@test.com");
        dto.setTwoFactorEnabled(true);
        dto.setTwoFactorType("TOTP");
        dto.setTwoFactorSecret("encrypted-secret");

        Mockito.when(jwtUtils.validateJwtToken("temp-token")).thenReturn(true);
        Mockito.when(jwtUtils.isTwoFactorToken("temp-token")).thenReturn(true);
        Mockito.when(jwtUtils.getUserNameFromJwtToken("temp-token")).thenReturn("user@test.com");
        Mockito.when(organisationServiceClient.getUserByEmail("user@test.com")).thenReturn(ResponseEntity.ok(dto));
        Mockito.when(twoFactorService.generateOtpCode()).thenReturn("123456");
        Mockito.when(twoFactorService.hashBackupCode("123456")).thenReturn("hashed-code");
        Mockito.when(organisationServiceClient.storeTwoFactorOtp(any(StoreTwoFactorOtpRequest.class)))
                .thenReturn(ResponseEntity.status(201).build());

        TwoFactorSendRequest request = new TwoFactorSendRequest();
        request.setTemporaryToken("temp-token");
        request.setMethod("EMAIL");
        request.setPurpose("LOGIN");

        mockMvc.perform(post("/api/v1/auth/2fa/send")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        verify(emailService).sendOtpCode("user@test.com", "123456");
        verify(organisationServiceClient).storeTwoFactorOtp(any(StoreTwoFactorOtpRequest.class));
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
}
