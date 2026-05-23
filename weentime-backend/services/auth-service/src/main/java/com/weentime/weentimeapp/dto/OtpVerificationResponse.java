package com.weentime.weentimeapp.dto;

import lombok.Data;

@Data
public class OtpVerificationResponse {
    private boolean valid;
    private String reason;
    private String message;
    private Integer attemptsRemaining;
}
