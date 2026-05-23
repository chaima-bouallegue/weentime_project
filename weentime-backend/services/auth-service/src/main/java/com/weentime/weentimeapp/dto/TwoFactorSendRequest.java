package com.weentime.weentimeapp.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class TwoFactorSendRequest {
    @NotBlank
    private String method;

    private String purpose = "LOGIN";
    private String tempToken;
    private String temporaryToken;

    public String resolveTemporaryToken() {
        return temporaryToken != null && !temporaryToken.isBlank() ? temporaryToken : tempToken;
    }
}
