package com.weentime.weentimeapp.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class Verify2faRequest {
    @NotBlank
    private String code;

    private String mfaToken;
    private String tempToken;
    private String temporaryToken;
    private String method;

    public String resolveTemporaryToken() {
        if (mfaToken != null && !mfaToken.isBlank()) {
            return mfaToken;
        }
        return temporaryToken != null && !temporaryToken.isBlank() ? temporaryToken : tempToken;
    }
}
