package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StoreTwoFactorOtpRequest {
    private String email;
    private String method;
    private String purpose;
    private String codeHash;
    private String ipAddress;
}
