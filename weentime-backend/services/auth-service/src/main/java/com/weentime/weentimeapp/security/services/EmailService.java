package com.weentime.weentimeapp.security.services;

import lombok.RequiredArgsConstructor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;

    public void sendOtpCode(String to, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(to);
        message.setSubject("Votre code de vérification Weentime 🔐");
        message.setText("Votre code de vérification est : " + code + "\nCe code expirera dans 5 minutes.");
        mailSender.send(message);
    }
}
