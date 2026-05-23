package com.weentime.weentimeproject.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class StoreTwoFactorOtpRequest {
    @NotBlank
    private String email;
    @NotBlank
    private String method;
    @NotBlank
    private String purpose;
    @NotBlank
    private String codeHash;
    private String ipAddress;
}
