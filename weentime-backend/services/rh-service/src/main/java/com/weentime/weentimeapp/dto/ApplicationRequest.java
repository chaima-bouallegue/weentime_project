package com.weentime.weentimeapp.dto;

import lombok.Data;

@Data
public class ApplicationRequest {
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String linkedinUrl;
    private boolean gdprConsent;
}
