package com.weentime.weentimeapp.dto;

import lombok.Data;

@Data
public class TwoFactorDisableRequest {
    private String password;
    private String code;
}
