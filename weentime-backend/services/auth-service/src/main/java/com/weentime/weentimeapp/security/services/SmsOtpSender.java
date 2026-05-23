package com.weentime.weentimeapp.security.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class SmsOtpSender {
    private final Environment environment;

    public void sendOtpCode(String phoneNumber, String code) {
        if (isDevProfile()) {
            log.warn("[DEV ONLY] SMS OTP for {}: {}", phoneNumber, code);
            return;
        }
        throw new IllegalStateException("SMS_PROVIDER_NOT_CONFIGURED");
    }

    private boolean isDevProfile() {
        for (String profile : environment.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(profile) || "local".equalsIgnoreCase(profile)) {
                return true;
            }
        }
        return false;
    }
}
