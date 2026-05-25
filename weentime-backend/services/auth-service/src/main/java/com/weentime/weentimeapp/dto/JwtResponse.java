package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class JwtResponse {
    private String token;
    @Builder.Default
    private String type = "Bearer";
    private Long id;
    private Long userId;
    private String email;
    private Long entrepriseId;
    private List<String> roles;
    private boolean mfaRequired;
    private String mfaToken;
    private String message;
    private boolean requires2FA;
    private boolean requiresTwoFactor;
    private String tempToken;
    private String temporaryToken;
    private List<String> availableMethods;
    private String maskedEmail;
    private String maskedPhone;

    public JwtResponse(String token, Long id, String email, Long entrepriseId, List<String> roles,
                       boolean requires2FA, String tempToken) {
        this.token = token;
        this.type = "Bearer";
        this.id = id;
        this.userId = id;
        this.email = email;
        this.entrepriseId = entrepriseId;
        this.roles = roles;
        this.mfaRequired = requires2FA;
        this.mfaToken = tempToken;
        this.message = requires2FA ? "MFA_REQUIRED" : null;
        this.requires2FA = requires2FA;
        this.requiresTwoFactor = requires2FA;
        this.tempToken = tempToken;
        this.temporaryToken = tempToken;
    }
}
