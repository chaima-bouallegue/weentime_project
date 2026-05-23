package com.weentime.weentimeproject.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class OtpVerificationResponse {
    private boolean valid;
    private String reason;
    private String message;
    private Integer attemptsRemaining;
}
