package com.weentime.weentimeapp.security.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;
    private final Environment environment;

    public void sendOtpCode(String to, String code) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(to);
            message.setSubject("Votre code de verification WeenTime");
            message.setText("Votre code de verification est : " + code + "\nCe code expirera dans 5 minutes.");
            mailSender.send(message);
        } catch (MailException exception) {
            if (isDevProfile()) {
                log.warn("[DEV ONLY] Email OTP for {}: {}", to, code);
                return;
            }
            throw exception;
        }
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
