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
    private Long id;
    private String email;
    private Long entrepriseId;
    private List<String> roles;
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
        this.id = id;
        this.email = email;
        this.entrepriseId = entrepriseId;
        this.roles = roles;
        this.requires2FA = requires2FA;
        this.requiresTwoFactor = requires2FA;
        this.tempToken = tempToken;
        this.temporaryToken = tempToken;
    }
}
