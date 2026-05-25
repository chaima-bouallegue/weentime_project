package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;

@Data
public class TwoFactorDisableRequest {
    @JsonAlias("currentPassword")
    private String password;

    @JsonAlias({"totpCode", "verificationCode", "otp"})
    private String code;
}
